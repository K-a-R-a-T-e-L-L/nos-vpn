import { resolveTargetInternalSquadUuids } from './remnawave-squad-policy'

describe('resolveTargetInternalSquadUuids', () => {
    const main = '11111111-1111-4111-8111-111111111111'
    const testLab = '22222222-2222-4222-8222-222222222222'
    const commercial = '33333333-3333-4333-8333-333333333333'

    it.each([
        ['new user', [], [main]],
        ['MAIN member', [main], [main]],
        ['MAIN and TEST-LAB member', [main, testLab], [main, testLab]],
        ['TEST-LAB-only member', [testLab], [main, testLab]],
        ['old commercial member', [main, commercial], [main]],
        ['TEST-LAB and old commercial member', [main, testLab, commercial], [main, testLab]],
        ['nonmember', [commercial], [main]],
    ])('%s receives only tariff squads and previously held preserved squads', (_label, current, expected) => {
        expect(
            resolveTargetInternalSquadUuids({
                tariffSquadUuids: [main],
                currentSquadUuids: current,
                preservedAllowlist: [testLab],
            }),
        ).toEqual(expected)
    })

    it('removes duplicates and keeps deterministic tariff-first order', () => {
        expect(
            resolveTargetInternalSquadUuids({
                tariffSquadUuids: [main, main],
                currentSquadUuids: [testLab, main, testLab],
                preservedAllowlist: [testLab, testLab],
            }),
        ).toEqual([main, testLab])
    })
})
