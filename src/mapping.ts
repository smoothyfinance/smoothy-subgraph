import { log } from '@graphprotocol/graph-ts'
import { Contract, Transfer } from "../generated/Contract/Contract"
import { SyUSD } from "../generated/schema"


export function handleTransfer(event: Transfer): void {
  let id = event.block.hash.toHex()
  let entity = SyUSD.load(id)
  if (entity == null) {
    entity = new SyUSD(id)
  }
  entity.id = id
  entity.block = event.block.number
  let contract = Contract.bind(event.address)
  let ts = contract.try_totalSupply()
  if (ts.reverted) {
    log.info("totalSupply reverted", [])
  } else {
    entity.totalSupply = ts.value
  }
  let tb = contract.try__totalBalance()
  if (tb.reverted) {
    log.info("totalBalance reverted", [])
  } else {
    entity.totalBalance = tb.value
  }
  entity.save()
}
