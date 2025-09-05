import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, test } from 'vitest'
import { Arc1400Factory } from '../artifacts/security_token/Arc1400Client'

describe('Arc1644 controller', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    // Ensure the deploying account has sufficient spendable balance (box storage + app call costs)

    const factory = localnet.algorand.client.getTypedAppFactory(Arc1400Factory, { defaultSender: account })
    const { appClient } = await factory.deploy({ onUpdate: 'append', onSchemaBreak: 'append' })
    await localnet.algorand.account.ensureFunded(appClient.appAddress, account, AlgoAmount.MicroAlgo(200000))
    return { client: appClient }
  }

  test('test deploy arc1400', async () => {
    const testAccount = await localnet.context.generateAccount({ initialFunds: AlgoAmount.Algo(10) })
    const { client } = await deploy(testAccount)
    await client.send.bootstrap1400({
      args: {
        decimals: 6,
        name: new Uint8Array(Buffer.from('Test Token')),
        symbol: new Uint8Array(Buffer.from('TST')),
        totalSupply: 1_000_000_000_000n,
        controllable: true,
        controller: testAccount.addr.toString(),
        minControllerActionInterval: 1,
        owner: testAccount.addr.toString(),
        requireJustification: true,
      },
    })
  })
})
