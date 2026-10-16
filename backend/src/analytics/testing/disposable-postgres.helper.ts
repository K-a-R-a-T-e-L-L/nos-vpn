import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

type CommandRunner = (executable: string, args: string[], options: { stdio: 'ignore' }) => unknown

export type DisposablePostgres = {
    host: '127.0.0.1'
    port: number
    user: 'postgres'
    database: 'postgres'
    dataDirectory: string
    socketDirectory: string
    pid: number
    stop: () => void
}

function executableName(name: string) {
    return process.platform === 'win32' ? `${name}.exe` : name
}

function postgresBinCandidates(): string[] {
    const candidates: string[] = []
    if (process.env.POSTGRES_BIN_DIR) candidates.push(process.env.POSTGRES_BIN_DIR)

    const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [executableName('initdb')], {
        encoding: 'utf8',
    })
    if (lookup.status === 0 && lookup.stdout.trim()) candidates.push(dirname(lookup.stdout.trim().split(/\r?\n/)[0]))

    if (process.platform === 'win32') {
        for (const drive of ['C:', 'D:']) {
            for (const version of ['18', '17', '16', '15', '14', '13'])
                candidates.push(join(`${drive}\\Program Files\\PostgreSQL`, version, 'bin'))
        }
    } else if (existsSync('/usr/lib/postgresql')) {
        for (const version of readdirSync('/usr/lib/postgresql').sort().reverse())
            candidates.push(join('/usr/lib/postgresql', version, 'bin'))
    }

    return [...new Set(candidates)]
}

function findPostgresBin(): string {
    const bin = postgresBinCandidates().find(
        (candidate) =>
            existsSync(join(candidate, executableName('initdb'))) &&
            existsSync(join(candidate, executableName('pg_ctl'))),
    )
    if (!bin) throw new Error('A real local PostgreSQL installation is required; set POSTGRES_BIN_DIR')
    return bin
}

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            if (!address || typeof address === 'string')
                return server.close(() => reject(new Error('Failed to allocate a local PostgreSQL port')))
            server.close((error) => (error ? reject(error) : resolve(address.port)))
        })
    })
}

export function buildInitdbArguments(dataDirectory: string): string[] {
    return ['-D', dataDirectory, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']
}

export function buildPostgresServerOptions(
    port: number,
    socketDirectory: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const options = ['-h', '127.0.0.1', '-p', String(port)]
    if (platform !== 'win32') options.push('-k', socketDirectory)
    return options.join(' ')
}

export function buildPgCtlStartArguments(
    dataDirectory: string,
    logFile: string,
    port: number,
    socketDirectory: string,
    platform: NodeJS.Platform = process.platform,
): string[] {
    return [
        '-D',
        dataDirectory,
        '-l',
        logFile,
        '-o',
        buildPostgresServerOptions(port, socketDirectory, platform),
        '-w',
        'start',
    ]
}

export function buildPgCtlStopArguments(dataDirectory: string): string[] {
    return ['-D', dataDirectory, '-m', 'fast', '-w', 'stop']
}

function postgresLog(logFile: string) {
    return existsSync(logFile) ? readFileSync(logFile, 'utf8') : '<postgres.log was not created>'
}

export function startPostgresProcess(
    pgCtl: string,
    dataDirectory: string,
    logFile: string,
    port: number,
    socketDirectory: string,
    runner: CommandRunner = execFileSync,
    platform: NodeJS.Platform = process.platform,
) {
    try {
        runner(pgCtl, buildPgCtlStartArguments(dataDirectory, logFile, port, socketDirectory, platform), {
            stdio: 'ignore',
        })
    } catch (cause) {
        const error = new Error(
            `pg_ctl failed to start disposable PostgreSQL on 127.0.0.1:${port}.\npostgres.log:\n${postgresLog(logFile)}`,
        )
        ;(error as Error & { cause?: unknown }).cause = cause
        throw error
    }
}

function run(executable: string, args: string[]) {
    execFileSync(executable, args, { stdio: 'ignore' })
}

function isRunning(pgCtl: string, dataDirectory: string) {
    return spawnSync(pgCtl, ['-D', dataDirectory, 'status'], { stdio: 'ignore' }).status === 0
}

export async function startDisposablePostgres(prefix: string): Promise<DisposablePostgres> {
    const postgresBin = findPostgresBin()
    const root = mkdtempSync(join(tmpdir(), prefix))
    const dataDirectory = join(root, 'data')
    const socketDirectory = join(root, 'socket')
    const logFile = join(root, 'postgres.log')
    const initdb = join(postgresBin, executableName('initdb'))
    const pgCtl = join(postgresBin, executableName('pg_ctl'))
    const port = await freePort()
    let started = false
    let disposed = false

    try {
        mkdirSync(socketDirectory, { recursive: true })
        run(initdb, buildInitdbArguments(dataDirectory))
        startPostgresProcess(pgCtl, dataDirectory, logFile, port, socketDirectory)
        started = true
        const pid = Number.parseInt(readFileSync(join(dataDirectory, 'postmaster.pid'), 'utf8').split(/\r?\n/)[0], 10)

        return {
            host: '127.0.0.1',
            port,
            user: 'postgres',
            database: 'postgres',
            dataDirectory,
            socketDirectory,
            pid,
            stop: () => {
                if (disposed) return
                if (started) run(pgCtl, buildPgCtlStopArguments(dataDirectory))
                started = false
                disposed = true
                rmSync(root, { recursive: true, force: true })
            },
        }
    } catch (error) {
        if (isRunning(pgCtl, dataDirectory)) {
            try {
                run(pgCtl, buildPgCtlStopArguments(dataDirectory))
            } catch (stopError) {
                const cleanupError = new Error(
                    `${error instanceof Error ? error.message : String(error)}\nFailed to stop the disposable PostgreSQL cluster during cleanup: ${stopError instanceof Error ? stopError.message : String(stopError)}`,
                )
                ;(cleanupError as Error & { cause?: unknown }).cause = error
                throw cleanupError
            }
        }
        rmSync(root, { recursive: true, force: true })
        throw error
    }
}
