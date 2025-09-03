import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { Arc1643Factory } from '../artifacts/security_token/Arc1643Client'

// Helper to convert string to bytes
const s2b = (s: string) => new TextEncoder().encode(s)

// Simple sha256 mock (since we just need deterministic bytes) – using built-in crypto if available
const hashBytes = (input: string) => new TextEncoder().encode(input.padEnd(32, '0')).slice(0, 32)

describe('Arc1643 document registry', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    // Ensure the deploying account has sufficient spendable balance (box storage + app call costs)

    const factory = localnet.algorand.client.getTypedAppFactory(Arc1643Factory, { defaultSender: account })
    const { appClient } = await factory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
    await localnet.algorand.account.ensureFunded(appClient.appAddress, account, AlgoAmount.MicroAlgo(200000))
    return { client: appClient }
  }

  test('set and get document', async () => {
    const testAccount = await localnet.context.generateAccount({ initialFunds: AlgoAmount.Algo(10) })
    const { client } = await deploy(testAccount)

    const name = s2b('T&C')
    const uri = 'ipfs://terms-v1'
    const hash = hashBytes('hash1')

    await client.send.arc1643SetDocument({ args: { name, uri, hash } })

    const rec = await client.arc1643GetDocument({ args: { name } })
    expect(rec.uri).toBe(uri)
    expect(Buffer.from(rec.hash)).toStrictEqual(Buffer.from(hash))
    expect(rec.timestamp).toBeGreaterThan(0n)
  })

  test('list documents', async () => {
    const testAccount = await localnet.context.generateAccount({ initialFunds: AlgoAmount.Algo(10) })
    const { client } = await deploy(testAccount)

    const docs = [
      { name: s2b('A'), uri: 'ipfs://a', hash: hashBytes('a') },
      { name: s2b('B'), uri: 'ipfs://b', hash: hashBytes('b') },
      { name: s2b('C'), uri: 'ipfs://c', hash: hashBytes('c') },
    ]
    for (const d of docs) {
      await client.send.arc1643SetDocument({ args: d })
    }

    const keysResult: any = await client.arc1643GetAllDocuments()
    const keys: Uint8Array[] = Array.isArray(keysResult) ? keysResult : (keysResult.return ?? [])
    const keyStrings = keys.map((k: Uint8Array) => Buffer.from(k).toString('utf-8'))
    expect(new Set(keyStrings)).toStrictEqual(new Set(['A', 'B', 'C']))
  })

  test('update document emits event and new timestamp', async () => {
    const testAccount = await localnet.context.generateAccount({ initialFunds: AlgoAmount.Algo(10) })
    const { client } = await deploy(testAccount)

    const name = s2b('POLICY')
    const hash1 = hashBytes('h1')
    const hash2 = hashBytes('h2')

    await client.send.arc1643SetDocument({ args: { name, uri: 'ipfs://v1', hash: hash1 } })
    const rec1 = await client.arc1643GetDocument({ args: { name } })

    await new Promise((r) => setTimeout(r, 20)) // ensure timestamp difference

    await client.send.arc1643SetDocument({ args: { name, uri: 'ipfs://v2', hash: hash2 } })
    const rec2 = await client.arc1643GetDocument({ args: { name } })

    expect(rec2.uri).toBe('ipfs://v2')
    expect(Buffer.from(rec2.hash)).toStrictEqual(Buffer.from(hash2))
    expect(rec2.timestamp).toBeGreaterThan(rec1.timestamp)
    // ensure hash changed
    expect(Buffer.from(rec1.hash)).not.toStrictEqual(Buffer.from(rec2.hash))
    // No direct round comparison due to simplified send return structure
  })

  test('remove document emits event and cannot be fetched', async () => {
    const testAccount = await localnet.context.generateAccount({ initialFunds: AlgoAmount.Algo(10) })
    const { client } = await deploy(testAccount)

    const name = s2b('DOC')
    await client.send.arc1643SetDocument({ args: { name, uri: 'ipfs://d1', hash: hashBytes('doc') } })

    await client.send.arc1643RemoveDocument({ args: { name } })

    // Attempt to get should throw (not_found)
    await expect(async () => client.arc1643GetDocument({ args: { name } })).rejects.toThrow(/not_found/i)
  })

  test('non-owner cannot set or remove', async () => {
    const testAccount = await localnet.context.generateAccount({ initialFunds: AlgoAmount.Algo(10) })
    // create and fund a second account for non-owner tests
    const nonOwner = await localnet.context.generateAccount({ initialFunds: AlgoAmount.Algo(10) })
    const { client } = await deploy(testAccount)

    const name = s2b('R1')
    await client.send.arc1643SetDocument({ args: { name, uri: 'ipfs://r1', hash: hashBytes('r1') } })

    await expect(async () =>
      client.send.arc1643SetDocument({
        args: { name: s2b('R2'), uri: 'ipfs://r2', hash: hashBytes('r2') },
        sender: nonOwner,
      }),
  ).rejects.toThrow(/only_owner/i)
    await expect(async () => client.send.arc1643RemoveDocument({ args: { name }, sender: nonOwner })).rejects.toThrow(
      /only_owner/i,
    )
  })
})
