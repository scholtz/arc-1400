import { arc4, GlobalState } from '@algorandfoundation/algorand-typescript'
import { Arc200 } from './arc200.algo'

export class Arc88 extends Arc200 {
  public owner = GlobalState<arc4.Address>({ key: 'owner', initialValue: new arc4.Address() })

  public arc88_owner(): arc4.Address {
    return this.owner.value
  }
}
