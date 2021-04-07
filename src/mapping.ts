import { BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import {Contract, Swap, SwapAll, Transfer} from "../generated/Contract/Contract"
import { SyUSD, Volume, LastEvent } from "../generated/schema"

const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const LAST_EVENT_ID = 'last_event_id';

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

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function handleSwapAll(event: SwapAll): void {
  let id = event.transaction.hash.toHexString();
  let entity = Volume.load(id)
  if (entity == null) {
    entity = new Volume(id)
  }
  entity.id = id
  entity.block = event.block.number

  let amount = BigDecimal.fromString('0');
  let amountsArray = event.params.amounts;
  for (let i = 0; i < amountsArray.length; i++) {
    amount = amount.plus(convertTokenToDecimal(amountsArray[i], BigInt.fromI32(18)));
  }
  entity.amount = amount;

  // Previous Event
  let lastEvent = LastEvent.load(LAST_EVENT_ID);
  if (lastEvent == null) {
    lastEvent = new LastEvent(LAST_EVENT_ID);
  } else {
    const lastEntity = Volume.load(lastEvent.lastId)
    if (lastEntity != null) {
      entity.totalAmount = entity.amount.plus(lastEntity.totalAmount);
    }
  }
  lastEvent.lastId = id;
  lastEvent.save();

  entity.save();
}

export function handleSwap(event: Swap): void {
  let id = event.transaction.hash.toHexString();
  let entity = Volume.load(id)
  if (entity == null) {
    entity = new Volume(id)
  }
  entity.id = id;
  entity.block = event.block.number;
  entity.amount = convertTokenToDecimal(event.params.outAmount, BigInt.fromI32(18));
  entity.totalAmount = entity.amount;

  // Previous Event
  let lastEvent = LastEvent.load(LAST_EVENT_ID);
  if (lastEvent == null) {
    lastEvent = new LastEvent(LAST_EVENT_ID);
  } else {
    let lastEntity = Volume.load(lastEvent.lastId)
    if (lastEntity != null) {
      entity.totalAmount = entity.amount.plus(lastEntity.totalAmount);
    }
  }
  lastEvent.lastId = id;
  lastEvent.save();

  entity.save();
}
