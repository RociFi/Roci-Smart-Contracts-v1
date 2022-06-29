// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "../libraries/Structs.sol";

/**
 * @title ScoreDBInterface
 * @author RociFI Labs
 * @notice Interface for the ScoreDB contract.
 **/

interface ScoreDBInterface {
    // Returns the current scores for the token from the on-chain storage.
    function getScore(uint256 tokenId) external view returns (Structs.Score memory);

    // Called by the lending contract, initiates logic to update score and fulfill loan.
    function pause() external;

    // UnPauses the contract [OWNER]
    function unpause() external;

    function LTV(address _token, uint16 _score) external view returns (uint256);

    function LT(address _token, uint16 _score) external view returns (uint256);
}
