// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./Investor.sol";
import "../interfaces/revManager/IRevenueManager.sol";
import "../libraries/PoolRateCalculator.sol";
import {ONE_YEAR, ROLE_ADMIN, ROLE_REV_MANAGER, ROLE_COLLECTOR} from "../Globals.sol";
import "../interfaces/newInterfaces/investor/IpoolInvestor.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {POOL_INVESTOR_VERSION} from "../ContractVersions.sol";
import {Errors} from "../libraries/Errors.sol";

/**
 * @title PoolInvestor
 * @author RociFI Labs
 */

contract PoolInvestor is IpoolInvestor, Investor, ERC20 {
    using PoolRateCalculator for uint256;

    // config vars
    uint256 public override reserveRate = ONE_HUNDRED_PERCENT;

    uint256 public poolValue;

    mapping(address => uint256) public override stakeTimes;
    // Events
    event LiquidityDeposited(
        uint256 timestamp,
        address indexed pool,
        address indexed depositor,
        uint256 indexed amountDeposited
    );
    event LiquidityWithdrawn(
        uint256 timestamp,
        address indexed pool,
        address indexed withdrawer,
        uint256 indexed amountWithdrawn
    );
    event InterestRateAnnualSet(
        uint256 timestamp,
        address indexed pool,
        uint256 indexed interestRate
    );
    event ReserveRateSet(uint256 timestamp, address indexed pool, uint256 indexed reserveRate);
    event StakingRewardClaimed(uint256 timestamp, address indexed staker, uint256 indexed rewards);
    event LoanCollected(
        uint256 timestamp,
        uint256 indexed loanId,
        uint256 collectedInterest,
        address borrower
    );

    constructor(
        IAddressBook _addressBook,
        address _token,
        bytes1 _prefix,
        bytes1 _postfix
    )
        Investor(_addressBook, IERC20Metadata(_token))
        ERC20(
            "Roci Debt Token",
            string(abi.encodePacked(_prefix, IERC20Metadata(_token).symbol(), _postfix))
        )
    {
        token = IERC20Metadata(_token);
        _updateApprovals();
    }

    function revenueManager() private view returns (IRevenueManager) {
        return IRevenueManager(lookup(ROLE_REV_MANAGER));
    }

    /**
     * @dev owner can set interestRateAnnual
     * @param _interestRateAnnual new interestRateAnnual
     */
    function setInterestRateAnnual(uint256 _interestRateAnnual)
        external
        override
        onlyRole(ROLE_ADMIN)
    {
        require(_interestRateAnnual > 0, Errors.POOL_INVESTOR_INTEREST_RATE);
        interestRateAnnual = _interestRateAnnual;
        emit InterestRateAnnualSet(block.timestamp, address(this), _interestRateAnnual);
    }

    /**
     * @dev function for dev to update approvals if addresses have changed
     */
    function updateApprovals() external onlyRole(ROLE_ADMIN) {
        _updateApprovals();
    }

    /// @dev setter for reserve rate
    function setReserveRate(uint256 _new) external override onlyRole(ROLE_ADMIN) {
        reserveRate = _new;
        emit ReserveRateSet(block.timestamp, address(this), _new);
    }

    /**
     * @dev Returns debt token price
     */
    function getDebtTokensToMintAmount(uint256 _amount) public view returns (uint256 toMint) {
        if (totalSupply() == 0) {
            return toMint = _amount;
        }
        require(poolValue > 0, Errors.POOL_INVESTOR_ZERO_POOL_VALUE);
        toMint = (_amount * totalSupply()) / poolValue;
    }

    function getWithdrawalTokenReturnAmount(uint256 _amount)
        public
        view
        returns (uint256 toReturn)
    {
        require(totalSupply() > 0, Errors.POOL_INVESTOR_ZERO_TOTAL_SUPPLY);
        toReturn = (_amount * poolValue) / totalSupply();
    }

    /**
     * @dev deposits stablecoins for some rate of rTokens
     * NOTE ideally should send straight to revManager, but user would need to approve it
     */
    function depositPool(uint256 _amount, string memory version)
        external
        override
        whenNotPaused
        checkVersion(version)
    {
        uint256 toMint = getDebtTokensToMintAmount(_amount);
        addressBook.updateLimitResetTimestamp();
        limitDailyCheck(_amount);
        limitGlobalCheck(_amount);
        poolValue += _amount;
        token.transferFrom(msg.sender, address(this), _amount);
        revenueManager().payment(address(token), _amount);

        stakeTimes[msg.sender] = block.timestamp;
        _mint(msg.sender, toMint);

        emit LiquidityDeposited(block.timestamp, address(this), msg.sender, _amount);
    }

    /**
     * @dev Function to return liquidity into pool from liquidated loans
     */
    function depositWithoutMint(uint256 _amount, string memory version)
        external
        whenNotPaused
        checkVersion(version)
        onlyRole(ROLE_ADMIN)
    {
        poolValue += _amount;
        token.transferFrom(msg.sender, address(this), _amount);
        revenueManager().payment(address(token), _amount);
    }

    /**
     * @dev function to exchange rToken back for stablecoins
     */
    function withdrawalPool(uint256 _amount, string memory version)
        external
        override
        whenNotPaused
        checkVersion(version)
    {
        uint256 toReturn = getWithdrawalTokenReturnAmount(_amount);
        _burn(msg.sender, _amount);
        revenueManager().requestFunds(address(token), toReturn);
        poolValue -= toReturn;
        token.transfer(msg.sender, toReturn);
        stakeTimes[msg.sender] = block.timestamp;
        if (
            addressBook.poolDailyLimit(address(this)) != 0 ||
            addressBook.defaultPoolDailyLimit() != 0
        ) limits.valueToday -= uint128(toReturn);
        if (
            addressBook.poolGlobalLimit(address(this)) != 0 ||
            addressBook.defaultPoolGlobalLimit() != 0
        ) limits.totalValue -= toReturn;
        emit LiquidityWithdrawn(block.timestamp, address(this), msg.sender, _amount);
    }

    /**
     * @dev same as function in Investor. But we count accrued interest and
     * send all funds to RevenuManager after
     */
    function collect(uint256[] memory _ids, string memory version)
        public
        override
        whenNotPaused
        onlyRole(ROLE_COLLECTOR)
        checkVersion(version)
    {
        IBonds bonds = IBonds(lookup(ROLE_BONDS));

        IERC20CollateralPayment paymentc = IERC20CollateralPayment(lookup(ROLE_PAYMENT_CONTRACT));

        uint256 accumulatedInterest;

        for (uint256 i = 0; i < _ids.length; i++) {
            uint256 _id = _ids[i];
            uint256 stakeIndex = stakingIndexes[_id];

            (, , , uint256 balBefore, ) = bonds.getStakingAt(address(this), stakeIndex);
            // unstake bonds to collect interest
            bonds.unstake(stakeIndex);
            uint256 bal = bonds.balanceOf(address(this), _id);
            require(bal >= balBefore, Errors.POOL_INVESTOR_BONDS_LOST);
            Loan.loan memory loan = paymentc.loanLookup(_id);
            // withdrawal profit
            if (bal >= loan.awaitingCollection && loan.awaitingCollection != 0) {
                if (loan.awaitingInterest > 0) {
                    accumulatedInterest += loan.awaitingInterest;
                }
                paymentc.withdrawl(_id, loan.awaitingCollection, address(this));
            }
            // stake remaining bonds again
            stakingIndexes[_id] = bonds.stake(_id, bonds.balanceOf(address(this), _id));
            emit LoanCollected(block.timestamp, _id, loan.awaitingInterest, loan.borrower);
        }
        uint256 wholeBalance = token.balanceOf(address(this));

        if (wholeBalance != 0) {
            uint256 revenueManagerShare = revenueManager().getRevenueManagerShare(
                accumulatedInterest
            );
            poolValue += revenueManagerShare;
            uint256 othersShare = accumulatedInterest - revenueManagerShare;
            revenueManager().payment(address(token), wholeBalance - othersShare);

            if (othersShare > 0) {
                revenueManager().sendToShareHolders(address(token), othersShare);
            }
        }
    }

    /**
     * @dev pc contract call this function to change poolValue inside investor, also it can be used
     * to change loan relative params inside investor, emit events
     */
    function liquidate(uint256 _id) external override onlyRole(ROLE_PAYMENT_CONTRACT) {
        IERC20CollateralPayment paymentc = IERC20CollateralPayment(lookup(ROLE_PAYMENT_CONTRACT));

        poolValue -= Loan.getOutstanding(paymentc.loanLookup(_id));
    }

    /**
     * @dev function to send funds to borrowers. Used to fulfill loans
     * @param _receiver is the receiver of the funds
     * @param _amount is the amount to send
     * NOTE this is meant to be overriden in order to contain logic for storing funds in other contracts
     */
    function _sendFunds(address _receiver, uint256 _amount) internal override {
        revenueManager().requestFunds(address(token), _amount);
        super._sendFunds(_receiver, _amount);
    }

    /**
     * @dev function helps check to make sure a loan is available before it's fulfilled
     *   thus saving the user the gas of a failed fullfilment
     */
    function _checkAvailable(uint256 _amount) internal override {
        IRevenueManager revManager = IRevenueManager(lookup(ROLE_REV_MANAGER));

        uint256 available = revManager.balanceAvailable(address(this));
        require(available >= _amount, Errors.POOL_INVESTOR_NOT_ENOUGH_FUNDS);

        super._checkAvailable(_amount);
    }

    function _updateApprovals() internal {
        IBonds bonds = IBonds(lookup(ROLE_BONDS));
        IERC20CollateralPayment paymentc = IERC20CollateralPayment(lookup(ROLE_PAYMENT_CONTRACT));
        bonds.setApprovalForAll(address(paymentc), true);
        token.approve(address(revenueManager()), uint256(2**256 - 1));
    }

    /**
     * @notice returns the current version of the contract.
     */
    function currentVersion() public pure override returns (string memory) {
        return POOL_INVESTOR_VERSION;
    }

    function limitGlobalCheck(uint256 _amount) private {
        uint256 _limit = addressBook.poolGlobalLimit(address(this));
        if (_limit == 0) _limit = addressBook.defaultPoolGlobalLimit();
        if (_limit != 0) {
            require(limits.totalValue + _amount <= _limit, Errors.POOL_INVESTOR_GLOBAL_LIMIT);
            limits.totalValue += _amount;
        }
    }

    function limitDailyCheck(uint256 _amount) private {
        uint256 _limit = addressBook.poolDailyLimit(address(this));
        if (_limit == 0) _limit = addressBook.defaultPoolDailyLimit();
        uint128 limitResetTimestamp = addressBook.limitResetTimestamp();
        if (_limit != 0) {
            if (limits.currentDayTimestamp < limitResetTimestamp) {
                limits.currentDayTimestamp = limitResetTimestamp;
                limits.valueToday = 0;
            }
            limits.lastTxTimestamp = uint128(block.timestamp);
            require(limits.valueToday + _amount <= _limit, Errors.POOL_INVESTOR_DAILY_LIMIT);
            limits.valueToday += uint128(_amount);
        }
    }
}
