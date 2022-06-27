const { expect } = require("chai");
const { ethers } = require("hardhat");
const { testsTimeout } = require("../hardhat.config.js");

const oneDay = 86400;

const {
  borrow,
  toWei,
  configureForTests,
  localDeployV3,
  mint,
  updateScore,
  configureAfterDeploy,
  deposit,
  toTokenWei,
  mine,
  snapshot,
  fromTokenWei,
  revert,
  setTokenBalanceFor,
  quickAddCollateralEther,
  quickborrow,
  getAllLoans,
  getCollateralUsdPrice,
  quickPayment,
  calculateExpectedCollateralAmountFromLiquidation,
  sumBigNumbers,
} = require("./lib.js");
const {
  ROCI_PAYMENT_VERSION,
  VERSION,
  LOAN_STATUSES,
  errors,
} = require("./constants.js");
const { BigNumber } = require("ethers");

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("Under-collateralised case (LTV >= 100%)", async function () {
  this.timeout(0);
  let cs;
  let owner, borrower;
  let init;
  let scenarioOneSnapshot;
  const initialLiquidity = "100000";
  const initialWethPrice = 2000;
  const borrowerScore = 6;
  const borrowAmountOne = "3000";
  let borrowAmountOneWei;
  let collateralAmount;
  let collateralAmountWei;
  let availableCollateral;
  let loanOne;
  let loanValue;

  before(async function () {
    this.timeout(testsTimeout);
    [owner, borrower] = await ethers.getSigners();

    cs = await localDeployV3();
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);

    cs.Investor = cs.InvestorRuSDC2;

    //Fill liquidity to pools
    await cs.TestUSDC.mint(
      owner.address,
      await toTokenWei(initialLiquidity, cs.TestUSDC)
    );

    await deposit({
      pool: cs.Investor,
      token: cs.TestUSDC,
      user: owner,
      amount: initialLiquidity,
    });

    borrower.nfcs = await mint(cs.NFCS, borrower);

    await updateScore(cs.ScoreDB, borrower.nfcs, borrowerScore, borrower);

    // WETH price = initialWETHPrice
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, initialWethPrice);

    borrowAmountOneWei = await toTokenWei(borrowAmountOne, cs.TestUSDC);

    collateralAmount = parseInt(borrowAmountOne) / parseInt(initialWethPrice);

    // collateralAmount * initialWETHPrice > Amount1
    collateralAmount = collateralAmount + (collateralAmount * 5) / 100;

    collateralAmountWei = await toTokenWei(collateralAmount, cs.TestETH);

    expect(
      (await fromTokenWei(collateralAmountWei, cs.TestETH)) * initialWethPrice
    ).greaterThan(parseInt(borrowAmountOne));

    await setTokenBalanceFor(cs.TestETH, borrower, collateralAmountWei);

    await cs.TestETH.connect(borrower).approve(
      cs.CollateralManager.address,
      collateralAmountWei
    );

    // Borrower1 adds collateralAmount
    await cs.RociPayment.connect(borrower).addCollateral(
      borrower.address,
      cs.TestETH.address,
      collateralAmountWei
    );

    // Borrower1 borrows Loan1:
    loanOne = await borrow(
      cs.RociPayment,
      cs.Investor,
      borrower,
      borrowAmountOne,
      borrower.nfcs,
      0,
      cs.TestETH,
      cs.TestUSDC
    );

    // Principal = Amount1
    expect(loanOne.principal).equal(
      await toTokenWei(borrowAmountOne, cs.TestUSDC)
    );

    // LTV > 100%
    expect(loanOne.ltv.gt(toWei("100"))).true;

    // APR > 0
    expect((await cs.Investor.interestRateAnnual()).gt("0")).true;

    // Wait 15 days
    await mine(oneDay * 15);

    // Borrower repaid Amount1 /2 USDC of Loan1

    await cs.TestUSDC.connect(borrower).approve(
      cs.RociPayment.address,
      borrowAmountOneWei.div("2")
    );

    await cs.RociPayment.connect(borrower).payment(
      loanOne.id,
      borrowAmountOneWei.div("2"),
      ROCI_PAYMENT_VERSION
    );

    // Still Amount1/ 2 USDC left to repay
    // Wait 20 days
    await mine(oneDay * 20);

    // On T35 (Day 35) of the Loan1, maturity date and grace period have passed, loan is eligible for the liquidation
    // loanValue = totalPaymentsValue - paymentComplete = Amount1/2 + interest + lateFee,
    //lateFee = APR*2 during extra 5 days of Grace period, interest and lateFee accrued on Amount1/2,
    //not on initial principal

    loanOne = Object.assign(
      { id: loanOne.id },
      await cs.RociPayment.loanLookup(loanOne.id)
    );

    loanValue = loanOne.totalPaymentsValue.sub(loanOne.paymentComplete);

    init = await snapshot();
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////
  /*
  Scenario 1:
  0. Collateral price didn’t change. i.e. there is more collateral than debt.
    
  1. Liquidator calls liquidateLoans on the loan and passes Loan1ID
  2. Liquidator receives liquidatedCollateral = loanValue / initialWETHPrice of WETH
  3. Borrower1 still has collateralAmount - liquidatedCollateral available for withdrawal
  4. Loan is marked as “CLOSED”
  5. Event is fired with all params
  6. Pool value is decreased by loanValue
  7. Liquidator balance is set to collateralUSDC = liquidatedCollateral * initialWETHPrice (for simplicity, we’re not simulating DEX here)
  8.Liquidator calls PoolInvestor.depositWithoutMint(collateralUSDC)
  9. poolValue increased by collateralUSDC
  10. Make snapshot Scenario1
  */
  it("Scenario 1", async () => {
    await revert(init);
    init = await snapshot();

    const oldPoolValue = await cs.Investor.poolValue();

    await setTokenBalanceFor(cs.TestETH, owner, "0");

    //1. Liquidator calls liquidateLoans on the loan and passes Loan1ID
    const liqTx = cs.RociPayment.connect(owner).liquidateLoans(
      [loanOne.id],
      ROCI_PAYMENT_VERSION
    );

    await liqTx;

    const decimalsDiff = Math.abs(
      (await cs.TestETH.decimals()) - (await cs.TestUSDC.decimals())
    );

    //   2. Liquidator receives liquidatedCollateral = loanValue / initialWETHPrice of WETH
    const liquidatedCollateral = await cs.TestETH.balanceOf(owner.address);
    expect(
      loanValue.mul(BigNumber.from(10).pow(decimalsDiff)).div(initialWethPrice)
    ).equal(liquidatedCollateral);

    // 3. Borrower1 still has collateralAmount - liquidatedCollateral available for withdrawal
    availableCollateral = await cs.RociPayment.connect(
      borrower
    ).getMaxWithdrawableCollateral();

    expect(availableCollateral).equal(
      collateralAmountWei.sub(liquidatedCollateral)
    );

    loanOne = Object.assign(
      { id: loanOne.id },
      await cs.RociPayment.loanLookup(loanOne.id)
    );

    // 4. Loan is marked as “CLOSED”
    expect(LOAN_STATUSES[loanOne.status]).equal("CLOSED");

    // 5. Event is fired with all params
    const liqTimestamp = BigNumber.from(
      (await ethers.provider.getBlock(liqTx.blockHash)).timestamp
    );

    expect(liqTx)
      .to.emit(cs.RociPayment, "Liquidated")
      .withArgs(liqTimestamp, loanOne.id, borrower.address, true);

    // 6. Pool value is decreased by loanValue
    const decreasedPoolValue = await cs.Investor.poolValue();

    expect(oldPoolValue.sub(decreasedPoolValue)).equal(loanValue);

    // 7. Liquidator balance is set to collateralUSDC = liquidatedCollateral * initialWETHPrice (for simplicity, we’re not simulating DEX here)
    const liquidityToReturn = liquidatedCollateral.mul(initialWethPrice);

    await setTokenBalanceFor(cs.TestUSDC, owner, liquidityToReturn);

    // 8.Liquidator calls PoolInvestor.depositWithoutMint(collateralUSDC)
    await cs.TestUSDC.approve(cs.Investor.address, liquidityToReturn);

    await cs.Investor.depositWithoutMint(liquidityToReturn, VERSION);

    // 9. poolValue increased by collateralUSDC
    expect(await cs.Investor.poolValue()).equal(
      decreasedPoolValue.add(liquidityToReturn)
    );

    // 10. Make snapshot Scenario1
    scenarioOneSnapshot = await snapshot();
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////
  /*
  Scenario 3:

0. Multiple loans with different maturity dates with the price drop

1. Return to snapshot Scenario1 (Day 35)
2. Borrower1 still has availableCollateral
3. Borrower1 borrows Loan2:
4. Principal = Amount2
5. Amount2 < availableCollateral / LT * initialWETHPrice
6. LTV > 100%
7. APR > 0%
8. Wait 5 days
9. Borrower1 borrows Loan3:
10. Principal = Amount3
11. Amount2 + Amount3 < availableCollateral / LT * initialWETHPrice
12. LTV > 100%
13. APR > 0%
14. Wait 3 days
15. newWETHPrice= initialWETHPrice * 0.7
16. Amount2 + Amount3 + interest + fees > availableCollateral * newWETHPrice / LT, outstanding loans are not collateralised by the available collateral
17. Borrower1 try to borrow, reverts with PAYMENT_NOT_ENOUGH_COLLATERAL
18. Wait 7 days (Day 50)
19. Liquidator calls liquidateLoans with Loan2ID
20. Liquidator receives availableCollateral
21. Borrower1 has 0 collateral available for withdrawal
22. Loan3 is marked as “DEFAULT”
23. Wait 25 days (Day 75)
24. Liquidator calls liquidateLoans with Loan3ID
25. Liquidator receives 0 collateral
26. Borrower1 has 0 collateral available for withdrawal
27. Loan3 is marked as “DEFAULT”
28. Borrower repay Loan2 and Loan3 in full, loans marked as “PAIDLATE”
  */
  it("Scenario 3", async () => {
    // 1. Return to snapshot Scenario1 (Day 35)
    await revert(scenarioOneSnapshot);
    scenarioOneSnapshot = await snapshot();

    // 2. Borrower1 still has availableCollateral
    expect(
      await cs.RociPayment.connect(borrower).getMaxWithdrawableCollateral()
    ).equal(availableCollateral);

    const decimalsDiff = Math.abs(
      (await cs.TestETH.decimals()) - (await cs.TestUSDC.decimals())
    );

    const availableToBorrow = availableCollateral
      .mul(initialWethPrice)
      .mul(toWei(100))
      .div(loanOne.lt)
      .div(BigNumber.from(10).pow(decimalsDiff));

    // 5. Amount2 < availableCollateral / LT * initialWETHPrice
    const amountTwo = availableToBorrow.sub(availableToBorrow.mul(35).div(100));

    // 11. Amount2 + Amount3 < availableCollateral / LT * initialWETHPrice
    const amountThree = availableToBorrow.sub(
      availableToBorrow.mul(75).div(100)
    );

    expect(amountTwo.add(amountThree).lt(availableToBorrow)).true;

    await updateScore(cs.ScoreDB, borrower.nfcs, borrowerScore, borrower);

    // 3. Borrower1 borrows Loan2:
    let loanTwo = await borrow(
      cs.RociPayment,
      cs.Investor,
      borrower,
      amountTwo,
      borrower.nfcs,
      0,
      cs.TestETH,
      cs.TestUSDC
    );

    // 6. LTV > 100%
    expect(loanTwo.ltv.gt(toWei(100))).true;

    // 7. APR > 0%
    expect((await cs.Investor.interestRateAnnual()).gt("0")).true;

    // 8. Wait 5 days
    await mine(oneDay * 5);

    // 9. Borrower1 borrows Loan3:
    await updateScore(cs.ScoreDB, borrower.nfcs, borrowerScore, borrower);

    let loanThree = await borrow(
      cs.RociPayment,
      cs.Investor,
      borrower,
      amountThree,
      borrower.nfcs,
      0,
      cs.TestETH,
      cs.TestUSDC
    );

    // 6. LTV > 100%
    expect(loanThree.ltv.gt(toWei(100))).true;

    // 7. APR > 0%
    expect((await cs.Investor.interestRateAnnual()).gt("0")).true;

    // 14. Wait 3 days
    await mine(oneDay * 3);

    // 15. newWETHPrice= initialWETHPrice * 0.7
    const newETHprice = initialWethPrice * 0.4;

    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, newETHprice);

    // 16. Amount2 + Amount3 + interest + fees > availableCollateral * newWETHPrice / LT, outstanding loans are not collateralised by the available collateral
    await cs.Investor.collect([loanTwo.id, loanThree.id], VERSION);

    loanTwo = Object.assign(
      { id: loanTwo.id },
      await cs.RociPayment.loanLookup(loanTwo.id)
    );

    loanThree = Object.assign(
      { id: loanThree.id },
      await cs.RociPayment.loanLookup(loanThree.id)
    );

    expect(
      loanTwo.totalPaymentsValue
        .add(loanThree.totalPaymentsValue)
        .gt(
          availableCollateral
            .mul(newETHprice)
            .mul(toWei(100))
            .div(loanTwo.lt)
            .div(BigNumber.from(10).pow(decimalsDiff))
        )
    );

    // 17. Borrower1 try to borrow, reverts with PAYMENT_NOT_ENOUGH_COLLATERAL
    expect(
      borrow(
        cs.RociPayment,
        cs.Investor,
        borrower,
        amountThree,
        borrower.nfcs,
        0,
        cs.TestETH,
        cs.TestUSDC
      )
    ).to.be.revertedWith(errors.PAYMENT_NOT_ENOUGH_COLLATERAL);

    // 18. Wait 27 days (Day 50)
    await mine(oneDay * 27);

    // 19. Liquidator calls liquidateLoans with Loan2ID
    await setTokenBalanceFor(cs.TestETH, owner, "0");

    await cs.RociPayment.connect(owner).liquidateLoans(
      [loanTwo.id],
      ROCI_PAYMENT_VERSION
    );

    loanTwo = Object.assign(
      { id: loanTwo.id },
      await cs.RociPayment.loanLookup(loanTwo.id)
    );

    // 20. Liquidator receives availableCollateral
    expect(await cs.TestETH.balanceOf(owner.address)).equal(
      availableCollateral
    );

    // 21. Borrower1 has 0 collateral available for withdrawal
    expect(
      await cs.RociPayment.connect(borrower).getMaxWithdrawableCollateral()
    ).equal("0");

    // 22. Loan2 is marked as “DEFAULT”

    expect(LOAN_STATUSES[loanTwo.status]).equal("DEFAULT");

    // 23. Wait 5 days (Day 75)
    await mine(oneDay * 5);

    // 24. Liquidator calls liquidateLoans with Loan3ID
    await setTokenBalanceFor(cs.TestETH, owner, "0");

    await cs.RociPayment.connect(owner).liquidateLoans(
      [loanThree.id],
      ROCI_PAYMENT_VERSION
    );

    loanThree = Object.assign(
      { id: loanThree.id },
      await cs.RociPayment.loanLookup(loanThree.id)
    );
    // 25. Liquidator receives 0 collateral
    expect(await cs.TestETH.balanceOf(owner.address)).equal("0");

    // 26. Borrower1 has 0 collateral available for withdrawal
    expect(
      await cs.RociPayment.connect(borrower).getMaxWithdrawableCollateral()
    ).equal("0");

    // 27. Loan3 is marked as “DEFAULT”
    expect(LOAN_STATUSES[loanThree.status]).equal("DEFAULT");

    // 28. Borrower repay Loan2 and Loan3 in full, loans marked as “PAIDLATE”
    loanTwo = Object.assign(
      { id: loanTwo.id },
      await cs.RociPayment.loanLookup(loanTwo.id)
    );

    loanThree = Object.assign(
      { id: loanThree.id },
      await cs.RociPayment.loanLookup(loanThree.id)
    );

    const toPay = loanTwo.totalPaymentsValue.add(loanThree.totalPaymentsValue);

    await setTokenBalanceFor(cs.TestUSDC, borrower, toPay);

    await cs.TestUSDC.connect(borrower).approve(cs.RociPayment.address, toPay);

    await cs.RociPayment.connect(borrower).payment(
      loanTwo.id,
      loanTwo.totalPaymentsValue,
      ROCI_PAYMENT_VERSION
    );

    await cs.RociPayment.connect(borrower).payment(
      loanThree.id,
      loanThree.totalPaymentsValue,
      ROCI_PAYMENT_VERSION
    );

    loanTwo = Object.assign(
      { id: loanTwo.id },
      await cs.RociPayment.loanLookup(loanTwo.id)
    );

    loanThree = Object.assign(
      { id: loanThree.id },
      await cs.RociPayment.loanLookup(loanThree.id)
    );

    expect(LOAN_STATUSES[loanTwo.status]).equal("PAIDLATE");
    expect(LOAN_STATUSES[loanThree.status]).equal("PAIDLATE");
  });

  it("Scenario 2", async () => {
    await revert(init);
    init = await snapshot();

    const initialPoolValue = await cs.Investor.poolValue();

    const newWETHPrice = initialWethPrice * 0.4;
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, newWETHPrice);

    // collateralAmount * newWETHPrice < Amount1
    expect(await getCollateralUsdPrice(cs, collateralAmountWei)).lt(
      toWei(borrowAmountOne)
    );

    // Liquidator calls liquidateLoans on the loan and passes Loan1ID
    const txReceipt = await cs.RociPayment.connect(owner)
      .liquidateLoans([loanOne.id], ROCI_PAYMENT_VERSION)
      .then((txResp) => txResp.wait());
    const liquidationEvent = txReceipt.events
      .filter(({ event }) => event === "Liquidated")
      .map(({ args }) => args)[0];

    // Event is fired with all params
    const { timestamp, loanId, borrower: b, success } = liquidationEvent;
    expect(typeof timestamp).equal("object");
    expect(typeof loanId).equal("object");
    expect(loanId).equal(loanOne.id);
    expect(typeof b).equal("string");
    expect(b).equal(borrower.address);
    expect(typeof success).equal("boolean");
    expect(success).equal(true);

    // Liquidator receives whole collateral of borrower
    expect(await cs.TestETH.balanceOf(owner.address)).equal(
      collateralAmountWei
    );

    // Borrower1 has 0 collateral available for withdrawal
    expect(
      await cs.RociPayment.connect(borrower).getMaxWithdrawableCollateral()
    ).equal(BigNumber.from(0));

    // Loan is marked as “DEFAULT”
    expect(
      await getAllLoans(cs, borrower.address).then(
        ([{ status }]) => status === "DEFAULT"
      )
    ).to.be.true;

    // Pool value is decreased by loanValue
    expect(await cs.Investor.poolValue()).equal(
      initialPoolValue.sub(loanValue)
    );

    // Liquidator balance is set to
    // collateralUsdc = expectedCollateralAmount * WETHLiquidationPrice
    const collateralUsdc = await getCollateralUsdPrice(
      cs,
      collateralAmountWei
    ).then((r) => r.div(collateralAmountWei));
    await setTokenBalanceFor(cs.TestUSDC, owner, collateralUsdc);
    await cs.TestUSDC.connect(owner).approve(
      cs.InvestorRuSDC1.address,
      collateralUsdc
    );

    // collateralUSDC < loanValue
    expect(collateralUsdc).lt(loanValue);

    const beforeReturn = await cs.InvestorRuSDC1.poolValue();
    // Liquidator calls PoolInvestor.depositWithoutMint(collateralUSDC)
    await cs.InvestorRuSDC1.depositWithoutMint(collateralUsdc, VERSION);

    // poolValue increased by collateralUSDC
    expect(await cs.InvestorRuSDC1.poolValue()).to.equal(
      beforeReturn.add(collateralUsdc)
    );

    // Wait 10 days
    await mine(10 * 24 * 3600);

    await cs.Investor.collect([loanOne.id], VERSION);

    const toRepay = await cs.RociPayment.loanLookup(loanOne.id).then(
      ({ totalPaymentsValue, paymentComplete }) =>
        totalPaymentsValue.sub(paymentComplete)
    );
    await setTokenBalanceFor(cs.TestUSDC, borrower, toRepay);
    await cs.TestUSDC.connect(borrower).approve(
      cs.RociPayment.address,
      toRepay
    );

    // Borrower1 repay the loan totalPaymentsValue - paymentComplete
    await cs.RociPayment.connect(borrower).payment(
      loanOne.id,
      toRepay,
      ROCI_PAYMENT_VERSION
    );
    await cs.Investor.collect([loanOne.id], VERSION);

    // Loan is marked as “PAIDLATE”
    expect(
      await getAllLoans(cs, borrower.address).then(
        ([{ status }]) => status === "PAIDLATE"
      )
    ).to.be.true;
  });
});

describe("Overcollateralised case (LTV < 100%)", () => {
  let cs;
  let pools;
  let owner, user2;
  let init;
  const initialLiquidity = "100000";

  before(async function () {
    this.timeout(testsTimeout);
    [owner, , user2] = await ethers.getSigners();

    cs = await localDeployV3();
    await configureAfterDeploy(cs, true);
    await configureForTests(cs);

    pools = [cs.InvestorRuSDC1, cs.InvestorRuSDC2, cs.InvestorRuSDC3];

    //Fill liquidity to pools
    await cs.TestUSDC.mint(
      owner.address,
      (await toTokenWei(initialLiquidity, cs.TestUSDC)).mul(pools.length)
    );

    await Promise.all(
      pools.map(async (pool) => {
        await deposit({
          pool: pool,
          token: cs.TestUSDC,
          user: owner,
          amount: initialLiquidity,
        });
      })
    );

    init = await snapshot();
  });

  it("Over-collateralized use-case", async () => {
    await revert(init);
    init = await snapshot();

    // for simplicity of calculations we have no shares
    expect(await cs.RevenueManager.getSharesLength()).equal(0);

    // Calculate normalizerCoefficient to convert USDC values to ETH values
    const stableCoinDecimals = await cs.TestUSDC.decimals();
    const collateralDecimals = await cs.TestETH.decimals();
    const normalizerCoefficient = ethers.utils.parseUnits(
      "1",
      collateralDecimals - stableCoinDecimals
    );

    // Set APR of 10
    await cs.InvestorRuSDC3.setInterestRateAnnual(toWei(10));

    // set initial price for ETH
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 4000);
    // Borrower1 adds collateralAmount
    const wholeCollateral = await toTokenWei(1, cs.TestETH);
    await quickAddCollateralEther(user2, wholeCollateral, cs);

    // Borrower1 borrows Loan1
    const amount1 = await toTokenWei(2000, cs.TestUSDC);
    const amount1Normalized = amount1.mul(normalizerCoefficient);
    await quickborrow(cs, user2, amount1, 0, "InvestorRuSDC3", 10);

    // Borrower1 borrows Loan2
    const amount2 = await toTokenWei(400, cs.TestUSDC);
    const amount2Normalized = amount2.mul(normalizerCoefficient);
    await quickborrow(cs, user2, amount2, 0, "InvestorRuSDC3", 10);

    // make sure loans are over-collateralized
    const [overColLoan1, overColLoan2] = await getAllLoans(cs, user2.address);
    expect(overColLoan1.lt).lt(100);
    expect(overColLoan1.ltv).lt(100);
    expect(overColLoan2.lt).lt(100);
    expect(overColLoan2.ltv).lt(100);

    // Amount2 < Amount1
    expect(amount2.lt(amount1)).to.be.true;

    const collateralUsd = await cs.CollateralManager.getCollateralLookup(
      cs.RociPayment.address,
      user2.address
    ).then(([, collateral]) => getCollateralUsdPrice(cs, collateral));

    // Amount1 + Amount2 < collateralAmount/LT
    expect(
      amount2Normalized
        .add(amount1Normalized)
        .lt(collateralUsd.mul(overColLoan1.lt).div(100))
    ).to.be.true;

    // wait for 15 days
    await mine(15 * 24 * 3600);
    await cs.InvestorRuSDC3.collect(
      [overColLoan1.loanId, overColLoan2.loanId],
      VERSION
    );

    const interest = await cs.RociPayment.loanLookup(overColLoan1.loanId).then(
      ({ totalPaymentsValue, principal }) => totalPaymentsValue.sub(principal)
    );
    const repay1 = await fromTokenWei(
      amount1.div(2).add(interest),
      cs.TestUSDC
    );
    // Borrower repaid Amount1 / 2 + interest
    await quickPayment(
      cs,
      user2,
      repay1,
      overColLoan1.loanId,
      "InvestorRuSDC3"
    );

    const poolValueAfterPayment = await cs.InvestorRuSDC3.poolValue();

    // Loan1: Amount1 / 2 left to repay
    expect(
      await cs.RociPayment.loanLookup(overColLoan1.loanId).then(
        ({ totalPaymentsValue, paymentComplete, principal }) =>
          totalPaymentsValue.sub(paymentComplete).eq(principal.div(2))
      )
    ).to.be.true;

    // wait for 15 days
    await mine(15 * 24 * 3600);
    await cs.InvestorRuSDC3.collect(
      [overColLoan1.loanId, overColLoan2.loanId],
      VERSION
    );

    // WETH price drops to ETHLiquidationPrice = (Amount1/2 + Amount2) / LT / collateralAmount
    const newCollateralPrice = amount2Normalized
      .add(amount1Normalized.div(2))
      .div(overColLoan1.lt)
      .mul(100)
      .div(wholeCollateral);
    await cs.PriceFeed.setPriceForToken(
      cs.TestETH.address,
      newCollateralPrice.toNumber()
    );

    // Loan1 and Loan2 are delinquent and eligible for liquidation
    expect(await cs.RociPayment.isDelinquent(overColLoan1.loanId)).to.be.true;
    expect(await cs.RociPayment.isDelinquent(overColLoan2.loanId)).to.be.true;

    const liquidatorEtherBalanceBefore = await cs.TestETH.balanceOf(
      owner.address
    );

    // the order of loans here matters, since after one loan liquidation
    // the health factor can be restored and remaining loan shouldn't be liquidated
    const loansForLiquidation = [overColLoan1, overColLoan2];
    const txResp = await cs.RociPayment.connect(owner).liquidateLoans(
      loansForLiquidation.map((l) => l.loanId),
      ROCI_PAYMENT_VERSION
    );
    const txReceipt = await txResp.wait();
    const liquidatedLoanIds = txReceipt.events
      .filter(({ event, args }) => event === "Liquidated" && args.success)
      .map(({ args }) => args.loanId);

    // calculate what is expected from all liquidated loans
    const expectedFromLiquidation = await Promise.all(
      liquidatedLoanIds.map((loanId) =>
        calculateExpectedCollateralAmountFromLiquidation(
          cs,
          loanId,
          newCollateralPrice.toNumber(),
          normalizerCoefficient
        )
      )
    ).then(sumBigNumbers);

    const liquidatorEtherBalanceAfter = await cs.TestETH.balanceOf(
      owner.address
    );

    // Liquidator gets expectedCollateralAmount from liquidation
    expect(expectedFromLiquidation).to.equal(
      liquidatorEtherBalanceAfter.sub(liquidatorEtherBalanceBefore)
    );

    // Liquidated loan gets CLOSED status, and non-liquidated loan should not have this status
    const loansStatusesMatch = await Promise.all(
      loansForLiquidation.map(({ loanId }) =>
        cs.RociPayment.loanLookup(loanId).then(({ status }) => {
          if (liquidatedLoanIds.includes(loanId)) {
            return status === "CLOSED";
          }
          return status !== "CLOSED";
        })
      )
    );
    expect(loansStatusesMatch.filter((s) => s).length).equal(
      loansForLiquidation.length
    );

    // Borrower1 still has collateralAmount - expectedCollateralAmount collateral available
    expect(
      await cs.CollateralManager.getCollateralLookup(
        cs.RociPayment.address,
        user2.address
      ).then(([, collateral]) => collateral)
    ).to.equal(wholeCollateral.sub(expectedFromLiquidation));

    // poolValue decreased by totalPaymentsValue - paymentComplete for each liquidated loan
    const expectedDecreaseOfPoolValue = await Promise.all(
      liquidatedLoanIds.map((loanId) =>
        cs.RociPayment.loanLookup(loanId).then(
          ({ totalPaymentsValue, paymentComplete }) =>
            totalPaymentsValue.sub(paymentComplete)
        )
      )
    ).then(sumBigNumbers);
    expect(
      await cs.InvestorRuSDC3.poolValue().then((currentPoolValue) =>
        poolValueAfterPayment.sub(currentPoolValue)
      )
    ).to.equal(expectedDecreaseOfPoolValue);

    // Liquidator balance is set to
    // collateralUsdc = expectedCollateralAmount * WETHLiquidationPrice
    const collateralUsdc = await getCollateralUsdPrice(
      cs,
      expectedFromLiquidation
    ).then((r) => r.div(normalizerCoefficient));
    await setTokenBalanceFor(cs.TestUSDC, owner, collateralUsdc);
    await cs.TestUSDC.connect(owner).approve(
      cs.InvestorRuSDC3.address,
      collateralUsdc
    );

    const beforeReturn = await cs.InvestorRuSDC3.poolValue();
    await cs.InvestorRuSDC3.depositWithoutMint(collateralUsdc, VERSION);

    // poolValue increased by collateralUSDC
    expect(await cs.InvestorRuSDC3.poolValue()).to.equal(
      beforeReturn.add(collateralUsdc)
    );
  });
});
