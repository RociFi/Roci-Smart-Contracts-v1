/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "../interfaces/IAddressBook.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Errors} from "../libraries/Errors.sol";
import {ONE_DAY} from "../Globals.sol";
import "../libraries/Functions.sol";
import "../interfaces/newInterfaces/investor/IpoolInvestor.sol";

/**
 * @author RociFi Labs
 * @title AddressBook
 *
 * @dev Contract to store a list of addresses for Roci
 */
contract AddressBook is IAddressBook, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public override latePenalty;
    uint256 public override scoreValidityPeriod;
    uint16 public override minScore;
    uint16 public override maxScore;
    uint16 public override notGenerated;
    uint16 public override generationError;

    uint8 public override penaltyAPYMultiplier;
    uint128 public override gracePeriod;

    uint128 public override dailyLimit;
    uint128 public override globalLimit;
    uint128 public override userDailyLimit;
    uint128 public override userGlobalLimit;

    uint256 private LOAN_DURATION;
    mapping(uint256 => uint128) public override globalNFCSLimit;

    uint128 public override defaultPoolDailyLimit;
    uint256 public override defaultPoolGlobalLimit;
    uint128 public override limitResetTimestamp;

    mapping(address => uint128) public override poolDailyLimit;
    mapping(address => uint256) public override poolGlobalLimit;

    // mapping of of role to address
    mapping(uint256 => address) public override addressList;

    // mapping of of role to error message
    string[] public override roleLookupErrorMessage;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        // Set Loan duration by default as 30 days (in seconds)
        LOAN_DURATION = 2592000;
        latePenalty = 200 ether;
        scoreValidityPeriod = 900;
        minScore = 1;
        maxScore = 11;
        notGenerated = 0;
        generationError = 1000;

        penaltyAPYMultiplier = 2;
        gracePeriod = 5 * 60 * 60 * 24;
        roleLookupErrorMessage = [
            Errors.ADDRESS_HANDLER_MISSING_ROLE_TOKEN,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_BONDS,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_INVESTOR,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_PAYMENT_CONTRACT,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_REV_MANAGER,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_COLLATERAL_MANAGER,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_PRICE_FEED,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_ORACLE,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_ADMIN,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_PAUSER,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_LIQUIDATOR,
            Errors.ADDRESS_HANDLER_MISSING_ROLE_COLLECTOR
        ];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setAddressToRole(uint256 role, address newAddress) external override onlyOwner {
        addressList[role] = newAddress;
    }

    function setDailyLimit(uint128 newLimit) public override onlyOwner {
        dailyLimit = newLimit;
    }

    function setGlobalLimit(uint128 newLimit) public override onlyOwner {
        globalLimit = newLimit;
    }

    function getMaturityDate() external view override returns (uint256) {
        return block.timestamp + LOAN_DURATION;
    }

    function setLoanDuration(uint256 _newLoanDuration) external override onlyOwner {
        // By default 30 days (in seconds)
        LOAN_DURATION = _newLoanDuration;
    }

    function setUserDailyLimit(uint128 newLimit) public override onlyOwner {
        userDailyLimit = newLimit;
    }

    function setUserGlobalLimit(uint128 newLimit) public override onlyOwner {
        userGlobalLimit = newLimit;
    }

    function setGlobalNFCSLimit(uint256 _nfcsId, uint128 newLimit) public override onlyOwner {
        globalNFCSLimit[_nfcsId] = newLimit;
    }

    function setLatePenalty(uint256 newPenalty) public override onlyOwner {
        latePenalty = newPenalty;
    }

    function setScoreValidityPeriod(uint256 newValidityPeriod) public override onlyOwner {
        scoreValidityPeriod = newValidityPeriod;
    }

    function setMinScore(uint16 newScore) public override onlyOwner {
        require(newScore < maxScore, Errors.ADDRESS_BOOK_SET_MIN_SCORE);
        minScore = newScore;
    }

    function setMaxScore(uint16 newScore) public override onlyOwner {
        require(newScore > minScore, Errors.ADDRESS_BOOK_SET_MAX_SCORE);
        maxScore = newScore;
    }

    function setNotGenerated(uint16 newValue) public override onlyOwner {
        notGenerated = newValue;
    }

    function setGenerationError(uint16 newValue) public override onlyOwner {
        generationError = newValue;
    }

    function setPenaltyAPYMultiplier(uint8 newMultiplier) public override onlyOwner {
        penaltyAPYMultiplier = newMultiplier;
    }

    function setGracePeriod(uint128 newPeriod) public override onlyOwner {
        gracePeriod = newPeriod;
    }

    function setDefaultPoolDailyLimit(uint128 newLimit) public override onlyOwner {
        defaultPoolDailyLimit = newLimit;
    }

    function setDefaultPoolGlobalLimit(uint256 newLimit) public override onlyOwner {
        defaultPoolGlobalLimit = newLimit;
    }

    function setPoolDailyLimit(address pool, uint128 newLimit) external override onlyOwner {
        poolDailyLimit[pool] = newLimit;
    }

    function setPoolGlobalLimit(address pool, uint256 newLimit) external override onlyOwner {
        poolGlobalLimit[pool] = newLimit;
    }

    function updateLimitResetTimestamp() external override {
        if (limitResetTimestamp == 0) {
            limitResetTimestamp = uint128(block.timestamp + ONE_DAY);
        }
        if (limitResetTimestamp <= block.timestamp) {
            limitResetTimestamp += uint128(
                (Functions.roundedDiv(block.timestamp - limitResetTimestamp, ONE_DAY) + 1) * ONE_DAY
            );
        }
    }

    function setLimitResetTimestamp(uint128 newTimestamp) public override onlyOwner {
        limitResetTimestamp = newTimestamp;
    }
}
