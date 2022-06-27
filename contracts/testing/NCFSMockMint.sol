// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFCSMockMint is ERC721{
    constructor() ERC721("NFCS","NFCS"){}

    function mint(uint id) external{
        _mint(msg.sender, id);
    }
    // functions for global and daily limits
    function getLimits(uint) pure external returns(uint128, uint128,uint128, uint128){
        return(0,0,0,0);
    }

    function getUserTotalOustanding(uint) public pure returns(uint){
        return 0;
    }

    function getGlobalTotalOustanding() public pure returns(uint){
        return 0;
    }

}