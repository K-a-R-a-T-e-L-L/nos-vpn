export function resolveTargetInternalSquadUuids(input: {
    tariffSquadUuids: string[]
    currentSquadUuids: string[]
    preservedAllowlist: string[]
}): string[] {
    const preserved = new Set(input.preservedAllowlist)
    const target = [...input.tariffSquadUuids, ...input.currentSquadUuids.filter((uuid) => preserved.has(uuid))]
    return [...new Set(target)]
}
