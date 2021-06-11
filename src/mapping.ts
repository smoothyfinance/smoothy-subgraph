import { BigInt, Address, log } from '@graphprotocol/graph-ts'
import { Contract, Transfer } from "../generated/Contract/Contract"
import { YToken } from "../generated/Contract/YToken"
import { SyUSD } from "../generated/schema"

let DEFAULT_DECIMALS = BigInt.fromI32(10).pow(18)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

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
    let yb = getYBalance(contract, event.address)
    log.debug("totalBalance = {}, yBalanceToAdd = {}", [tb.value.toString(), yb.toString()])
    entity.totalBalance = tb.value.plus(yb)
  }
  entity.save()
}

function getYBalance(contract: Contract, address: Address): BigInt {
  let token_len = contract.try__ntokens()
  if (token_len.reverted) {
    return BigInt.fromI32(0)
  }
  let yBalance_total = BigInt.fromI32(0)
  for (let i = BigInt.fromI32(0); i.lt(token_len.value); i = i.plus(BigInt.fromI32(1))) {
    let addr = contract.try__yTokenAddresses(i)
    if (addr.reverted) {
      log.debug("try__yTokenAddresses revert", [])
      continue
    }
    if (addr.value.toHexString() == ZERO_ADDRESS) {
      // log.debug("_yTokenAddresses is empty", [])
      continue
    }
    let yToken = YToken.bind(addr.value)
    let symbol = yToken.try_symbol()
    if (symbol.reverted) {
      log.debug("try_symbol revert: address={}", [addr.value.toHexString()])
      continue
    }
    let pricePerShare = yToken.try_getPricePerFullShare()
    if (pricePerShare.reverted) {
      log.debug("try_getPricePerFullShare revert", [])
      continue
    }
    let share = yToken.try_balanceOf(address)
    if (share.reverted) {
      log.debug("try_balanceOf revert", [])
      continue
    }
    let decm = yToken.try_decimals()
    if (decm.reverted) {
      log.debug("try_decimals revert", [])
      continue
    }
    log.debug("i={} | yTokenAddress={} | symbol={} | decimal={}", [i.toString(), addr.value.toHexString(), symbol.value, BigInt.fromI32(decm.value).toString()])
    let yBalanceOldNormalized = contract.try__yBalances(i)
    if (yBalanceOldNormalized.reverted) {
      log.debug("try__yBalances revert", [])
      continue
    }
    let yBalanceNewUnnormalized = share.value.times(pricePerShare.value).div(DEFAULT_DECIMALS)
    let yBalanceNewNormalized = yBalanceNewUnnormalized.times(BigInt.fromI32(10).pow(<u8>(18 - decm.value)))
    let yBalance = yBalanceNewNormalized.minus(yBalanceOldNormalized.value)
    yBalance_total = yBalance_total.plus(yBalance)
    log.debug("i={} |{} - {}| yBalance={} | yBalance_total={}", [i.toString(), yBalanceNewNormalized.toString(), yBalanceOldNormalized.value.toString(), yBalance.toString(), yBalance_total.toString()])
  }
  return yBalance_total
}