// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./Iinvestor.sol";
import {IVersion} from "../../../Version/IVersion.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title PoolInvestor
 * @author RociFI Labs
 * @dev TestToken will eventually be replaced with ERC-20
 */
interface IpoolInvestor is IVersion, Iinvestor, IERC20Metadata {
    enum addresses_PoolInvestor {
        token,
        bonds,
        paymentContract,
        revManager
    }

    // state variables

    function reserveRate() external returns (uint256);

    function stakeTimes(address) external returns (uint256);

    /**
     * @dev owner can set interestRateAnnual
     * @param _interestRateAnnual new interestRateAnnual
     */
    function setInterestRateAnnual(uint256 _interestRateAnnual) external;

    /// @dev setter for reserve rate
    function setReserveRate(uint256 _new) external;

    /**
     * @dev deposits stablecoins for some rate of rTokens
     * NOTE ideally should send stright to revManager, but user would need to approve it
     */
    function depositPool(uint256 _amount, string memory _version) external;

    /**
     * @dev function to exchange rToken back for stablecoins
     */
    function withdrawalPool(uint256 _amount, string memory _version) external;

    /**
     * @dev collects an array of loan id's payments to this
     * @param _ids to collect on
     */
    function collect(uint256[] memory _ids, string memory _version) external;

    /**
     * @dev pc contract call this function to change poolValue inside investor, also it can be used
     * to change loan relative params inside investor, emit events
     */
    function liquidate(uint256 _id) external;
}
