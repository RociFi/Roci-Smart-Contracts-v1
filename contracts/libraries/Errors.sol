// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

/**
 * @title Errors library
 * @author RociFi Labs
 * @notice Defines the error messages emitted by the different contracts of the RociFi protocol
 * @dev Error messages prefix glossary:
 *  - NFCS = NFCS
 *  - BONDS = Bonds
 *  - INVESTOR = Investor
 *  - POOL_INVESTOR = PoolInvestor
 *  - SCORE_DB = ScoreConfigs, ScoreDB
 *  - PAYMENT = ERC20CollateralPayment, ERC20PaymentStandard, RociPayment
 *  - PRICE_FEED = PriceFeed
 *  - REVENUE = PaymentSplitter, RevenueManager
 *  - LOAN = Loan
 *  - VERSION = Version
 */
library Errors {
    string public constant NFCS_TOKEN_MINTED = "0"; //  Token already minted
    string public constant NFCS_TOKEN_NOT_MINTED = "1"; //  No token minted for address
    string public constant NFCS_ADDRESS_BUNDLED = "2"; // Address already bundled
    string public constant NFCS_WALLET_VERIFICATION_FAILED = "3"; //  Wallet verification failed
    string public constant NFCS_NONEXISTENT_TOKEN = "4"; // Nonexistent NFCS token
    string public constant NFCS_TOKEN_HAS_BUNDLE = "5"; //  Token already has an associated bundle
    string public constant NFCS_TOKEN_HAS_NOT_BUNDLE = "6"; //  Token does not have an associated bundle

    string public constant BONDS_HASH_AND_ENCODING = "100"; //  Hash of data signed must be the paymentContractAddress and id encoded in that order
    string public constant BONDS_BORROWER_SIGNATURE = "101"; // Data provided must be signed by the borrower
    string public constant BONDS_NOT_STACKING = "102"; //  Not staking any NFTs
    string public constant BONDS_NOT_STACKING_INDEX = "103"; //  Not staking any tokens at this index
    string public constant BONDS_DELETE_HEAD = "104"; // Cannot delete the head

    string public constant INVESTOR_ISSUE_BONDS = "200"; //  Issue minting bonds
    string public constant INVESTOR_INSUFFICIENT_AMOUNT = "201"; //  Cannot borrow an amount of 0
    string public constant INVESTOR_BORROW_WITH_ANOTHER_SCORE = "202"; //  Cannot borrow if there is active loans with different score or pool does not support the score

    string public constant POOL_INVESTOR_INTEREST_RATE = "300"; // Interest rate has to be greater than zero
    string public constant POOL_INVESTOR_ZERO_POOL_VALUE = "301"; // Pool value is zero
    string public constant POOL_INVESTOR_ZERO_TOTAL_SUPPLY = "302"; // Total supply is zero
    string public constant POOL_INVESTOR_BONDS_LOST = "303"; // Bonds were lost in unstaking
    string public constant POOL_INVESTOR_NOT_ENOUGH_FUNDS = "304"; // Not enough funds to fulfill the loan
    string public constant POOL_INVESTOR_DAILY_LIMIT = "305"; // Exceeds daily deposits limit
    string public constant POOL_INVESTOR_GLOBAL_LIMIT = "306"; // Exceeds total deposits limit

    string public constant MANAGER_COLLATERAL_NOT_ACCEPTED = "400"; // Collateral is not accepted
    string public constant MANAGER_COLLATERAL_INCREASE = "401"; // When increasing collateral, the same ERC20 address should be used
    string public constant MANAGER_ZERO_WITHDRAW = "402"; // Cannot withdrawal zero
    string public constant MANAGER_EXCEEDING_WITHDRAW = "403"; // Requested withdrawal amount is too large

    string public constant SCORE_DB_EQUAL_LENGTH = "501"; // Arrays must be of equal length
    string public constant SCORE_DB_VERIFICATION = "502"; // Unverified score
    string public constant SCORE_DB_SCORE_NOT_GENERATED = "503"; // Score not yet generated.
    string public constant SCORE_DB_SCORE_GENERATING = "504"; // Error generating score.
    string public constant SCORE_DB_UNKNOW_FETCHING_SCORE = "505"; //  Unknown error fetching score.

    string public constant PAYMENT_NFCS_OUTDATED = "600"; // Outdated NFCS score outdated
    string public constant PAYMENT_ZERO_LTV = "601"; // LTV cannot be zero
    string public constant PAYMENT_NOT_ENOUGH_COLLATERAL = "602"; // Not enough collateral to issue a loan
    string public constant PAYMENT_NO_BONDS = "603"; // There is no bonds to liquidate a loan
    string public constant PAYMENT_FULFILLED = "604"; // Contract is paid off
    string public constant PAYMENT_NFCS_OWNERSHIP = "605"; // NFCS ID must belong to the borrower
    string public constant PAYMENT_NON_ISSUED_LOAN = "606"; // Loan has not been issued
    string public constant PAYMENT_WITHDRAWAL_COLLECTION = "607"; // There are not enough payments available for collection
    string public constant PAYMENT_LOAN_NOT_DELINQUENT = "608"; // Loan not delinquent
    string public constant PAYMENT_AMOUNT_TOO_LARGE = "609"; // Payment amount is too large
    string public constant PAYMENT_CLAIM_COLLATERAL = "610"; // Cannot claim collateral if this collateral is necessary for any non Closed/Liquidated loan's delinquency statu

    string public constant PRICE_FEED_TOKEN_NOT_SUPPORTED = "700"; // Token is not supported
    string public constant PRICE_FEED_TOKEN_BELOW_ZERO = "701"; // Token below zero price

    string public constant REVENUE_ADDRESS_TO_SHARE = "800"; // Non-equal length of addresses and shares
    string public constant REVENUE_UNIQUE_INDEXES = "801"; // Indexes in an array must not be duplicate
    string public constant REVENUE_FAILED_ETHER_TX = "802"; // Failed to send Ether
    string public constant REVENUE_UNVERIFIED_INVESTOR = "803"; // Only verified investors may request funds or make a payment
    string public constant REVENUE_NOT_ENOUGH_FUNDS = "804"; // Not enough funds to complete this request

    string public constant LOAN_MIN_PAYMENT = "900"; // Minimal payment should be made
    string public constant LOAN_DAILY_LIMIT = "901"; // Exceeds daily borrow limit
    string public constant LOAN_DAILY_LIMIT_USER = "902"; // Exceeds user daily borrow limit
    string public constant LOAN_TOTAL_LIMIT_USER = "903"; // Exceeds user total borrow limit
    string public constant LOAN_TOTAL_LIMIT = "904"; // Exceeds total borrow limit
    string public constant LOAN_CONFIGURATION = "905"; // Loan that is already issued, or not configured cannot be issued
    string public constant LOAN_TOTAL_LIMIT_NFCS = "906"; // Exceeds total nfcs borrow limit
    string public constant LOAN_DAILY_LIMIT_NFCS = "907"; // Exceeds daily nfcs borrow limit

    string public constant VERSION = "1000"; // Incorrect version of contract

    string public constant ADDRESS_BOOK_SET_MIN_SCORE = "1100"; // New min score must be less then maxScore
    string public constant ADDRESS_BOOK_SET_MAX_SCORE = "1101"; // New max score must be more then minScore

    string public constant ADDRESS_HANDLER_MISSING_ROLE_TOKEN = "1200"; // Lookup failed for role Token
    string public constant ADDRESS_HANDLER_MISSING_ROLE_BONDS = "1201"; // Lookup failed for role Bonds
    string public constant ADDRESS_HANDLER_MISSING_ROLE_INVESTOR = "1202"; // Lookup failed for role Investor
    string public constant ADDRESS_HANDLER_MISSING_ROLE_PAYMENT_CONTRACT = "1203"; // Lookup failed for role Payment Contract
    string public constant ADDRESS_HANDLER_MISSING_ROLE_REV_MANAGER = "1204"; // Lookup failed for role Revenue Manager
    string public constant ADDRESS_HANDLER_MISSING_ROLE_COLLATERAL_MANAGER = "1205"; // Lookup failed for role Collateral Manager
    string public constant ADDRESS_HANDLER_MISSING_ROLE_PRICE_FEED = "1206"; // Lookup failed for role Price Feed
    string public constant ADDRESS_HANDLER_MISSING_ROLE_ORACLE = "1207"; // Lookup failed for role Oracle
    string public constant ADDRESS_HANDLER_MISSING_ROLE_ADMIN = "1208"; // Lookup failed for role Admin
    string public constant ADDRESS_HANDLER_MISSING_ROLE_PAUSER = "1209"; // Lookup failed for role Pauser
    string public constant ADDRESS_HANDLER_MISSING_ROLE_LIQUIDATOR = "1210"; // Lookup failed for role Liquidator
    string public constant ADDRESS_HANDLER_MISSING_ROLE_COLLECTOR = "1211"; // Lookup failed for role Collector
}
