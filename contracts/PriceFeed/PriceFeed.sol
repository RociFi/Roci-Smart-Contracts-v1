// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../libraries/Errors.sol";

contract PriceFeed is Ownable {
    mapping(address => address) priceFeedAddresses;
    // Events
    event PriceFeedAdded(uint256 timestamp, address indexed token, address indexed priceFeed);

    constructor() Ownable() {}

    /// @dev function for owner to add more price feeds
    function addPriceFeed(address _token, address _feed) external onlyOwner {
        priceFeedAddresses[_token] = _feed;
        emit PriceFeedAdded(block.timestamp, _token, _feed);
    }

    /**
     * Returns the latest price
     */
    function getLatestPriceUSD(address _token) public view virtual returns (uint256, uint8) {
        require(priceFeedAddresses[_token] != address(0), Errors.PRICE_FEED_TOKEN_NOT_SUPPORTED);

        AggregatorV2V3Interface priceFeed = AggregatorV2V3Interface(priceFeedAddresses[_token]);

        int256 price = priceFeed.latestAnswer();

        require(price > 0, Errors.PRICE_FEED_TOKEN_BELOW_ZERO);

        return (uint256(price), priceFeed.decimals());
    }
}
