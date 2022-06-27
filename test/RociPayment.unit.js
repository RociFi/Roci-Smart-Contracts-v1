const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { testsTimeout } = require("../hardhat.config.js");

const {
  borrow,
  sleep,
  // toWei,
  configureForTests,
  localDeployV3,
  mint,
  updateScore,
  configureAfterDeploy,
  setTokenBalanceFor,
  deposit,
  toTokenWei,
  calculateCollateralForBorrow,
  mine,
  snapshot,
  getLastBlockTimestamp,
  revert,
  quickBorrowWithPreciseCollaterall,
  getAllLoans,
} = require("./lib.js");
const {
  errors,
  VERSION,
  ROCI_PAYMENT_VERSION,
  NFCS_SCORE_TO_USDC_LTV,
} = require("./constants.js");

///////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////////////////////////

describe("RociPayment.liquidate()", () => {
  let cs;
  let users;
  let pools;
  let owner, user1, user2, user3, user4, user5, user6;
  let init;
  const initialLiquidity = "100000";
  const initialCollateral = "100";

  before(async function () {
    this.timeout(testsTimeout);
    [owner, user1, user2, user3, user4, user5, user6] =
      await ethers.getSigners();

    users = [owner, user1, user2, user3, user4, user5, user6];

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

  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  it("Should revert on liquient loans", async () => {
    await revert(init);
    init = await snapshot();
    let liquent = [];

    let liquientUsers = [user4, user5, user6];
    const liquientScore = [3, 5, 10];

    //Mint collateral to users
    await Promise.all(
      liquientUsers.map(async (user) => {
        await setTokenBalanceFor(cs.TestETH, user, initialCollateral);
      })
    );

    //Mint NFCS to users
    await Promise.all(
      liquientUsers.map(async (user) => {
        user.nfcs = await mint(cs.NFCS, user);
      })
    );

    for (let index in liquientScore) {
      await updateScore(
        cs.ScoreDB,
        liquientUsers[index].nfcs,
        liquientScore[index],
        liquientUsers[index]
      );
      liquientUsers[index].score = liquientScore[index];
    }

    //Liquient:
    //User4(3) -> 2 loans (pool1) (600, 800)
    //User5(2) -> 2 loans (pool1, pool2) (1250, 430)
    //User6(10) -> 3 loans (pool3) (100, 200, 2600)
    let liquientCases = [
      {
        user: user4,
        loans: [
          { pool: cs.InvestorRuSDC1, amount: "600", collateral: null },
          { pool: cs.InvestorRuSDC1, amount: "800", collateral: null },
        ],
      },
      {
        user: user5,
        loans: [
          { pool: cs.InvestorRuSDC2, amount: "1250", collateral: null },
          { pool: cs.InvestorRuSDC2, amount: "430", collateral: null },
        ],
      },
      {
        user: user6,
        loans: [
          { pool: cs.InvestorRuSDC3, amount: "100", collateral: null },
          { pool: cs.InvestorRuSDC3, amount: "200", collateral: null },
          { pool: cs.InvestorRuSDC3, amount: "2600", collateral: null },
        ],
      },
    ];

    //calculate collateral
    await Promise.all(
      liquientCases.map(async (deliqCase) => {
        await Promise.all(
          deliqCase.loans.map(async (loan) => {
            loan.collateral = await calculateCollateralForBorrow(
              cs.PriceFeed,
              loan.amount,
              NFCS_SCORE_TO_USDC_LTV[deliqCase.user.score],
              cs.TestETH,
              cs.TestUSDC
            );
          })
        );
      })
    );

    for (let csea of liquientCases) {
      await cs.TestETH.connect(csea.user).approve(
        cs.CollateralManager.address,
        csea.loans.reduce(function (sum, loan) {
          return sum.add(loan.collateral);
        }, BigNumber.from("0"))
      );
      for (let userLoan of csea.loans) {
        const loan = await borrow(
          cs.RociPayment,
          userLoan.pool,
          csea.user,
          userLoan.amount,
          csea.user.nfcs,
          userLoan.collateral,
          cs.TestETH,
          cs.TestUSDC
        );
        liquent.push(loan);
      }
    }

    const liquentIds = liquent.map((loan) => loan.id);

    //Check that on batch reverts
    await expect(
      cs.RociPayment.connect(owner).liquidateLoans(
        liquentIds,
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_LOAN_NOT_DELINQUENT);

    //Check that one by one also reverts
    await Promise.all(
      liquentIds.map(async (id) => {
        await expect(
          cs.RociPayment.connect(owner).liquidateLoans(
            [id],
            ROCI_PAYMENT_VERSION
          )
        ).to.be.revertedWith(errors.PAYMENT_LOAN_NOT_DELINQUENT);
      })
    );
  });

  it.skip("Should liquidate deliquient loans, precisely check", async () => {
    await revert(init);
    init = await snapshot();

    //live users
    let liveUsers = users.slice(1);
    let liquientUsers = [user4, user5, user6];
    // let deliquientUsers = [user1, user2, user3];
    let deliquient;
    let liquent;
    const deliquienScore = [10, 8, 6];
    const liquientScore = [3, 2, 10];

    //Mint collateral to users
    await Promise.all(
      liveUsers.map(async (user) => {
        await setTokenBalanceFor(cs.TestETH, user, initialCollateral);
      })
    );

    //Mint NFCS to users
    await Promise.all(
      liveUsers.map(async (user) => {
        user.nfcs = await mint(cs.NFCS, user);
      })
    );

    //Users scores
    const allCaseScore = [...deliquienScore, ...liquientScore];

    for (let index in allCaseScore) {
      await updateScore(
        cs.ScoreDB,
        liveUsers[index].nfcs,
        allCaseScore[index],
        liveUsers[index]
      );
      liveUsers[index].score = allCaseScore[index];
    }

    //Make 16 loans: 9 deliquient and 7 liquient for different users and pools:
    //Deliquient:
    //User(score):
    //User1(10) -> 2 loans (pool1) (1000, 1500)
    //User2(8) -> 2 loans (pool2) (800, 200)
    //User3(6) -> 2 loans (pool3) (2400, 200)
    //User2(8) -> 2 loans (pool1, pool3) (50, 1300)
    //User1(10) -> 1 loan (pool1), 2 loans(pool2) (1200, 1100, 130)
    let deliquientCases = [
      {
        user: user1,
        loans: [
          { pool: cs.InvestorRuSDC1, amount: "1000", collateral: null },
          { pool: cs.InvestorRuSDC1, amount: "1500", collateral: null },
        ],
      },
      {
        user: user2,
        loans: [
          { pool: cs.InvestorRuSDC2, amount: "800", collateral: null },
          { pool: cs.InvestorRuSDC2, amount: "200", collateral: null },
        ],
      },
      {
        user: user3,
        loans: [
          { pool: cs.InvestorRuSDC3, amount: "2400", collateral: null },
          { pool: cs.InvestorRuSDC3, amount: "200", collateral: null },
        ],
      },
      {
        user: user2,
        loans: [
          { pool: cs.InvestorRuSDC1, amount: "50", collateral: null },
          { pool: cs.InvestorRuSDC3, amount: "1300", collateral: null },
        ],
      },
      {
        user: user1,
        loans: [
          { pool: cs.InvestorRuSDC1, amount: "1200", collateral: null },
          { pool: cs.InvestorRuSDC2, amount: "1100", collateral: null },
          { pool: cs.InvestorRuSDC2, amount: "130", collateral: null },
        ],
      },
    ];
    //Liquient:
    //User4(3) -> 2 loans (pool1) (600, 800)
    //User5(2) -> 2 loans (pool1, pool2) (1250, 430)
    //User6(10) -> 3 loans (pool3) (100, 200, 2600)
    let liquientCases = [
      {
        user: user4,
        loans: [
          { pool: cs.InvestorRuSDC1, amount: "600", collateral: null },
          { pool: cs.InvestorRuSDC1, amount: "800", collateral: null },
        ],
      },
      {
        user: user5,
        loans: [
          { pool: cs.InvestorRuSDC1, amount: "1250", collateral: null },
          { pool: cs.InvestorRuSDC2, amount: "430", collateral: null },
        ],
      },
      {
        user: user6,
        loans: [
          { pool: cs.InvestorRuSDC3, amount: "100", collateral: null },
          { pool: cs.InvestorRuSDC3, amount: "200", collateral: null },
          { pool: cs.InvestorRuSDC3, amount: "2600", collateral: null },
        ],
      },
    ];

    //calculate collateral
    await Promise.all(
      [...deliquientCases, ...liquientCases].map(async (deliqCase) => {
        await Promise.all(
          deliqCase.loans.map(async (loan) => {
            loan.collateral = await calculateCollateralForBorrow(
              cs.PriceFeed,
              loan.amount,
              NFCS_SCORE_TO_USDC_LTV[deliqCase.user.score],
              cs.TestETH,
              cs.TestUSDC
            );
          })
        );
      })
    );

    deliquient = [];

    for (let csea of deliquientCases) {
      await cs.TestETH.connect(csea.user).approve(
        cs.CollateralManager.address,
        csea.loans.reduce(function (sum, loan) {
          return sum.add(loan.collateral);
        }, BigNumber.from("0"))
      );
      for (let userLoan of csea.loans) {
        const loan = await borrow(
          cs.RociPayment,
          userLoan.pool,
          csea.user,
          userLoan.amount,
          csea.user.nfcs,
          userLoan.collateral,
          cs.TestETH,
          cs.TestUSDC
        );
        deliquient.push(loan);
      }
    }

    const maxMaturityDate = Math.max(
      ...deliquient.map((loan) => parseInt(loan.maturityDate))
    );

    const currentTimestamp = await getLastBlockTimestamp();

    const gracePeriod = await cs.AddressBook.gracePeriod();

    await mine(
      maxMaturityDate - parseInt(currentTimestamp) + parseInt(gracePeriod)
    );

    for (let index in liquientScore) {
      await updateScore(
        cs.ScoreDB,
        liquientUsers[index].nfcs,
        liquientScore[index],
        liquientUsers[index]
      );
      liquientUsers[index].score = liquientScore[index];
    }

    liquent = [];

    for (let csea of liquientCases) {
      await cs.TestETH.connect(csea.user).approve(
        cs.CollateralManager.address,
        csea.loans.reduce(function (sum, loan) {
          return sum.add(loan.collateral);
        }, BigNumber.from("0"))
      );
      for (let userLoan of csea.loans) {
        const loan = await borrow(
          cs.RociPayment,
          userLoan.pool,
          csea.user,
          userLoan.amount,
          csea.user.nfcs,
          userLoan.collateral,
          cs.TestETH,
          cs.TestUSDC
        );
        liquent.push(loan);
      }
    }

    const deliquientIds = deliquient.map((loan) => loan.id);

    await setTokenBalanceFor(cs.TestETH, owner, "0");

    await cs.RociPayment.connect(owner).liquidateLoans(
      deliquientIds,
      ROCI_PAYMENT_VERSION
    );

    //Precalculated value. TODO: add calculation function
    expect(await cs.TestETH.balanceOf(owner.address)).equal(
      "2332854627946426191"
    );

    // Make liquient loans deliquient
    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);
    // const liquentIds = liquent
    //   .filter((loan) => loan.lt.lt(toWei("100")))
    //   .map((loan) => loan.id);

    await setTokenBalanceFor(cs.TestETH, owner, "0");

    //TODO:fix this test
    await cs.RociPayment.connect(owner).liquidateLoans(
      deliquientIds,
      ROCI_PAYMENT_VERSION
    );
  });

  it("Successful liquidation for all missed loans (under- and over-collateralized)", async () => {
    await revert(init);
    init = await snapshot();

    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);

    await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      10,
      cs.TestETH,
      200,
      undefined,
      "InvestorRuSDC3"
    );

    const [overColLoan] = await getAllLoans(cs, user2.address);
    // check that loan is over-collateralized
    expect(overColLoan.lt).lt(100);
    expect(overColLoan.ltv).lt(100);

    await quickBorrowWithPreciseCollaterall(
      cs,
      user3,
      6,
      cs.TestETH,
      900,
      undefined,
      "InvestorRuSDC2"
    );

    const [underColLoan] = await getAllLoans(cs, user3.address);
    // check that loan is under-collateralized
    expect(underColLoan.lt).gt(100);
    expect(underColLoan.ltv).gt(100);

    // make sure loans are in different pools
    expect(overColLoan.poolAddress).not.eq(underColLoan.poolAddress);

    await sleep(1);
    await mine(4 * 24 * 3600);

    cs.InvestorRuSDC3.collect([overColLoan.loanId], VERSION);
    cs.InvestorRuSDC2.collect([underColLoan.loanId], VERSION);

    // Both types of loans are not delinquent before grace period
    expect(await cs.RociPayment.isDelinquent(overColLoan.loanId)).to.be.false;
    expect(await cs.RociPayment.isDelinquent(underColLoan.loanId)).to.be.false;

    // if loans are not delinquent they cannot be liquidated together or separately
    await expect(
      cs.RociPayment.connect(owner).liquidateLoans(
        [overColLoan.loanId, underColLoan.loanId],
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_LOAN_NOT_DELINQUENT);
    await expect(
      cs.RociPayment.connect(owner).liquidateLoans(
        [underColLoan.loanId],
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_LOAN_NOT_DELINQUENT);
    await expect(
      cs.RociPayment.connect(owner).liquidateLoans(
        [overColLoan.loanId],
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_LOAN_NOT_DELINQUENT);

    await mine(1 * 24 * 3600);

    cs.InvestorRuSDC3.collect([overColLoan.loanId], VERSION);
    cs.InvestorRuSDC2.collect([underColLoan.loanId], VERSION);

    // Both types of loans are delinquent after grace period
    expect(await cs.RociPayment.isDelinquent(overColLoan.loanId)).to.be.true;
    expect(await cs.RociPayment.isDelinquent(underColLoan.loanId)).to.be.true;

    // any missed payment loan can be liquidated
    cs.RociPayment.connect(owner).liquidateLoans(
      [overColLoan.loanId, underColLoan.loanId],
      ROCI_PAYMENT_VERSION
    );
  });

  it("Successful liquidation for under-collateralized loan by price drop but revert for over-collateralized", async () => {
    await revert(init);
    init = await snapshot();

    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 2000);

    await quickBorrowWithPreciseCollaterall(
      cs,
      user2,
      10,
      cs.TestETH,
      1000,
      undefined,
      "InvestorRuSDC3"
    );

    const [overColLoan] = await getAllLoans(cs, user2.address);
    expect(overColLoan.lt).lt(100);
    expect(overColLoan.ltv).lt(100);

    await quickBorrowWithPreciseCollaterall(
      cs,
      user3,
      6,
      cs.TestETH,
      1000,
      undefined,
      "InvestorRuSDC2"
    );

    const [underColLoan] = await getAllLoans(cs, user3.address);
    expect(underColLoan.lt).gt(100);
    expect(underColLoan.ltv).gt(100);

    // make sure loans are in different pools
    expect(overColLoan.poolAddress).not.eq(underColLoan.poolAddress);

    await expect(
      cs.RociPayment.connect(owner).liquidateLoans(
        [overColLoan.loanId, underColLoan.loanId],
        ROCI_PAYMENT_VERSION
      )
    ).to.be.revertedWith(errors.PAYMENT_LOAN_NOT_DELINQUENT);

    await cs.PriceFeed.setPriceForToken(cs.TestETH.address, 100);
    cs.InvestorRuSDC3.collect([overColLoan.loanId], VERSION);
    cs.InvestorRuSDC2.collect([underColLoan.loanId], VERSION);

    expect(await cs.RociPayment.isDelinquent(overColLoan.loanId)).to.be.true;
    expect(await cs.RociPayment.isDelinquent(underColLoan.loanId)).to.be.false;

    await cs.RociPayment.connect(owner).liquidateLoans(
      [overColLoan.loanId, underColLoan.loanId],
      ROCI_PAYMENT_VERSION
    );
  });
});
