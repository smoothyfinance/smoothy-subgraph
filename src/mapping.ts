import { BigInt, BigDecimal, Address, log } from '@graphprotocol/graph-ts'
import {Contract, Swap, SwapAll, Transfer} from "../generated/Contract/Contract"
import {SyUSD, Volume, LastEvent, TVL} from "../generated/schema"

const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const TWO_BI = BigInt.fromI32(2)
const THREE_BI = BigInt.fromI32(3)
const FOUR_BI = BigInt.fromI32(4)
const FIVE_BI = BigInt.fromI32(5)
const ZERO_BD = BigDecimal.fromString('0')
const LAST_EVENT_ID = 'last_event_id';
const LAST_TVL_ID = 'last_tvl_id';
const SYUSD_ADDRESS = Address.fromString('0xe5859f4efc09027a9b718781dcb2c6910cac6e91');

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


  // tvl
  let tvl = TVL.load(id)
  if (tvl != null) {
    return;
  }
  // skip 10m = 200 block
  let lastEvent = LastEvent.load(LAST_TVL_ID);
  if (lastEvent != null) {
    if (event.block.number.toI32() - lastEvent.block.toI32() < 200) {
      return;
    }
  } else {
    lastEvent = new LastEvent(LAST_TVL_ID);
  }
  lastEvent.block = event.block.number;
  lastEvent.lastId = '';
  lastEvent.save();

  tvl = new TVL(id);
  tvl.block = event.block.number;
  // ****get tvl****
  const syUSDContract = Contract.bind(SYUSD_ADDRESS);
  let tvlAmount = BigDecimal.fromString('0');
  for (let i = 0; i < 6; i++) {
    let result = syUSDContract.try_getTokenStats(BigInt.fromI32(i));
    if (result.reverted) {
      log.info("getTokenStats reverted", [])
    } else {
      let balance: BigInt = result.value.value2;
      tvlAmount = tvlAmount.plus(convertTokenToDecimal(balance, BigInt.fromI32(18)));
    }
  }
  tvl.amount = tvlAmount;
  // ****get tvl****
  tvl.save();
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
  if (event.params.inOutFlag.gt(ZERO_BI) && event.params.inOutFlag.lt(BigInt.fromI32(1024))) {
    let id = event.transaction.hash.toHexString();
    let entity = Volume.load(id)
    if (entity == null) {
      entity = new Volume(id)
    }
    entity.block = event.block.number

    let amount = BigDecimal.fromString('0');
    let amountsArray = event.params.amounts;
    for (let i = 0; i < amountsArray.length; i++) {
      amount = amount.plus(convertTokenToDecimal(amountsArray[i], BigInt.fromI32(18)));
    }
    entity.amount = amount.div(BigDecimal.fromString('2'));

    // Previous Event
    let lastEvent = LastEvent.load(LAST_EVENT_ID);
    if (lastEvent == null) {
      lastEvent = new LastEvent(LAST_EVENT_ID);
      entity.totalAmount = entity.amount;
      entity.busdTotalAmount = convertTokenToDecimal(amountsArray[0], BigInt.fromI32(18));
      entity.usdtTotalAmount = convertTokenToDecimal(amountsArray[1], BigInt.fromI32(18));
      entity.usdcTotalAmount = convertTokenToDecimal(amountsArray[2], BigInt.fromI32(18));
      entity.daiTotalAmount = convertTokenToDecimal(amountsArray[3], BigInt.fromI32(18));
      entity.paxTotalAmount = convertTokenToDecimal(amountsArray[4], BigInt.fromI32(18));
      if (amountsArray.length > 5) {
        entity.ustTotalAmount = convertTokenToDecimal(amountsArray[5], BigInt.fromI32(18));
      } else {
        entity.ustTotalAmount = BigDecimal.fromString('0');
      }
    } else {
      const lastEntity = Volume.load(lastEvent.lastId)
      entity.totalAmount = entity.amount.plus(lastEntity.totalAmount);
      entity.busdTotalAmount = lastEntity.busdTotalAmount.plus(convertTokenToDecimal(amountsArray[0], BigInt.fromI32(18)));
      entity.usdtTotalAmount = lastEntity.usdtTotalAmount.plus(convertTokenToDecimal(amountsArray[1], BigInt.fromI32(18)));
      entity.usdcTotalAmount = lastEntity.usdcTotalAmount.plus(convertTokenToDecimal(amountsArray[2], BigInt.fromI32(18)));
      entity.daiTotalAmount = lastEntity.daiTotalAmount.plus(convertTokenToDecimal(amountsArray[3], BigInt.fromI32(18)));
      entity.paxTotalAmount = lastEntity.paxTotalAmount.plus(convertTokenToDecimal(amountsArray[4], BigInt.fromI32(18)));
      if (amountsArray.length > 5) {
        entity.ustTotalAmount = lastEntity.ustTotalAmount.plus(convertTokenToDecimal(amountsArray[5], BigInt.fromI32(18)));
      } else {
        entity.ustTotalAmount = lastEntity.ustTotalAmount;
      }
    }
    lastEvent.block = ZERO_BI;
    lastEvent.lastId = id;
    lastEvent.save();

    entity.save();
  }
}

export function handleSwap(event: Swap): void {
  let id = event.transaction.hash.toHexString();
  const amount = convertTokenToDecimal(event.params.inAmount, BigInt.fromI32(18));

  // total amount
  let entity = Volume.load(id)
  if (entity == null) {
    entity = new Volume(id)
  }
  entity.id = id;
  entity.block = event.block.number;
  entity.amount = amount;

  // Last Event
  let lastEvent = LastEvent.load(LAST_EVENT_ID);
  if (lastEvent == null) {
    lastEvent = new LastEvent(LAST_EVENT_ID);
    entity.totalAmount = entity.amount;
    entity.busdTotalAmount = (event.params.bTokenIdIn == ZERO_BI || event.params.bTokenIdOut == ZERO_BI) ? amount : ZERO_BD;
    entity.usdtTotalAmount = (event.params.bTokenIdIn == ONE_BI || event.params.bTokenIdOut == ONE_BI) ? amount : ZERO_BD;
    entity.usdcTotalAmount = (event.params.bTokenIdIn == TWO_BI || event.params.bTokenIdOut == TWO_BI) ? amount : ZERO_BD;
    entity.daiTotalAmount = (event.params.bTokenIdIn == THREE_BI || event.params.bTokenIdOut == THREE_BI) ? amount : ZERO_BD;
    entity.paxTotalAmount = (event.params.bTokenIdIn == FOUR_BI || event.params.bTokenIdOut == FOUR_BI) ? amount : ZERO_BD;
    entity.ustTotalAmount = (event.params.bTokenIdIn == FIVE_BI || event.params.bTokenIdOut == FIVE_BI) ? amount : ZERO_BD;
  } else {
    let lastEntity = Volume.load(lastEvent.lastId)
    entity.totalAmount = entity.amount.plus(lastEntity.totalAmount);
    entity.busdTotalAmount = (event.params.bTokenIdIn == ZERO_BI || event.params.bTokenIdOut == ZERO_BI) ?
        lastEntity.busdTotalAmount.plus(amount) : lastEntity.busdTotalAmount;
    entity.usdtTotalAmount = (event.params.bTokenIdIn == ONE_BI || event.params.bTokenIdOut == ONE_BI) ?
        lastEntity.usdtTotalAmount.plus(amount) : lastEntity.usdtTotalAmount;
    entity.usdcTotalAmount = (event.params.bTokenIdIn == TWO_BI || event.params.bTokenIdOut == TWO_BI) ?
        lastEntity.usdcTotalAmount.plus(amount) : lastEntity.usdcTotalAmount;
    entity.daiTotalAmount = (event.params.bTokenIdIn == THREE_BI || event.params.bTokenIdOut == THREE_BI) ?
        lastEntity.daiTotalAmount.plus(amount) : lastEntity.daiTotalAmount;
    entity.paxTotalAmount = (event.params.bTokenIdIn == FOUR_BI || event.params.bTokenIdOut == FOUR_BI) ?
        lastEntity.paxTotalAmount.plus(amount) : lastEntity.paxTotalAmount;
    entity.ustTotalAmount = (event.params.bTokenIdIn == FIVE_BI || event.params.bTokenIdOut == FIVE_BI) ?
        lastEntity.ustTotalAmount.plus(amount) : lastEntity.ustTotalAmount;
  }
  lastEvent.block = ZERO_BI;
  lastEvent.lastId = id;
  lastEvent.save();

  entity.save();
}
