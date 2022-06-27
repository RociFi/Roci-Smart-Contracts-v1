//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
import "../PriceFeed/PriceFeed.sol";


contract PriceFeedMock is PriceFeed {


    mapping(address => uint256) prices;

    function getLatestPriceUSD(address _token) public override  view returns (uint256, uint8) {
        require(prices[_token] != 0, "This token is not supported");
        return (prices[_token], 18);
    }

    function setPriceForToken(address _token, uint256 _price) public {
        prices[_token] = _price * 1e18;
    }

    function getLatestPriceUSDOriginal(address _token) public  view returns (uint256, uint8) {
        return super.getLatestPriceUSD(_token);
    }
}
