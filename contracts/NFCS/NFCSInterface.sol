// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {IVersion} from "../Version/IVersion.sol";

interface NFCSInterface is IVersion {
    // Receives an address array, verifies ownership of addrs [WIP], mints a token, stores the bundle against token ID, sends token to msg.sender
    function mintToken(
        address[] memory bundle,
        bytes[] memory signatures,
        string memory _message,
        uint256 _nonce,
        string memory version
    ) external;

    // Receives a tokenId, returns corresponding address bundle
    function getBundle(uint256 tokenId)
        external
        view
        returns (address[] memory);

    // Receives an address, returns tokenOwned by it if any, otherwise reverts
    function getToken(address tokenOwner) external view returns (uint256);

    // Tells if an address owns a token or not
    function tokenExistence(address user) external view returns (bool);

    function getTotalOutstanding(uint _nfcsId) external view returns(uint,uint,uint);


    // function getUserAddressTotalOustanding(address _user) external view returns(uint);

    // function getGlobalTotalOustanding() external view returns(uint);

    function getLimits() external view returns(uint128, uint128,uint128, uint128);

    function getNFCSLimits(uint _nfcsId) external view returns(uint128, uint128);

}
