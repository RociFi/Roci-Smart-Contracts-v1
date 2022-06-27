// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../interfaces/ScoreDBInterface.sol";
import "../libraries/Structs.sol";
import {AddressHandler} from "../utilities/AddressHandler.sol";
import {IAddressBook} from "../interfaces/IAddressBook.sol";
import {Errors} from "../libraries/Errors.sol";
import {ROLE_PAUSER, ROLE_ADMIN} from "../Globals.sol";

/**
 * @title ScoreDB
 * @author RociFi Labs
 * @notice A contract responsible for fetching scores from off chain and executing lending logic leveraging Openzeppelin for upgradability (UUPS).
 */

contract ScoreDB is Pausable, AddressHandler, ScoreDBInterface {
    struct Config {
        uint256 LTV;
        uint256 LT;
    }
    using ECDSA for bytes32;

    // Mapping TokenId to Score
    mapping(uint256 => Structs.Score) private scoreCache;
    // Stores the address of the private key which signs the scores
    address public ROCI_ADDRESS;

    event ScoreUpdated(uint256 timestamp, uint256 indexed tokenId, uint16 indexed score);
    event RociAddressChanged(uint256 timestamp, address indexed _rociAddress);

    mapping(address => mapping(uint16 => Config)) private _scoreConfigs;

    constructor(address _addressBook) AddressHandler(IAddressBook(_addressBook)) {}

    function updateScore(
        uint256 tokenId,
        uint16 score,
        uint256 timestamp,
        bytes memory sig
    ) public whenNotPaused {
        // Reostruct the score object
        Structs.Score memory thisScore = Structs.Score(tokenId, timestamp, score);
        // Require that signer is ROCI
        require(verify(thisScore, sig), Errors.SCORE_DB_VERIFICATION);
        // Store the score
        scoreCache[thisScore.tokenId] = thisScore;
        // Emit score updated event
        emit ScoreUpdated(block.timestamp, tokenId, score);
    }

    /**
     * @notice returns the score of a tokenId from the cache
     */
    function getScore(uint256 tokenId) public view override returns (Structs.Score memory) {
        return scoreCache[tokenId];
    }

    /**
     * @notice returns true if the _signer is ROCI
     */
    function verify(Structs.Score memory _score, bytes memory _sig) internal view returns (bool) {
        require(
            _score.creditScore != addressBook.notGenerated(),
            Errors.SCORE_DB_SCORE_NOT_GENERATED
        );
        require(
            _score.creditScore != addressBook.generationError(),
            Errors.SCORE_DB_SCORE_GENERATING
        );
        require(
            _score.creditScore < addressBook.maxScore() &&
                _score.creditScore >= addressBook.minScore(),
            Errors.SCORE_DB_UNKNOW_FETCHING_SCORE
        );

        // Recreate msg hash from inputs
        bytes32 objectHash = getObjectHash(_score);
        return objectHash.toEthSignedMessageHash().recover(_sig) == ROCI_ADDRESS;
    }

    /**
     * @notice returns the keccak256 hash of the score object
     */
    function getObjectHash(Structs.Score memory score) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(score.tokenId, score.creditScore, score.timestamp));
    }

    function setRociAddress(address _addr) public onlyRole(ROLE_ADMIN) {
        ROCI_ADDRESS = _addr;
        emit RociAddressChanged(block.timestamp, _addr);
    }

    /**
     * @notice Pauses the whole contract; used as emergency response in case a bug is detected. [OWNER_ONLY]
     */
    function pause() public override onlyRole(ROLE_PAUSER) {
        _pause();
    }

    /**
     * @notice unpauses the contract; resumes functionality. [OWNER_ONLY]
     */
    function unpause() public override onlyRole(ROLE_PAUSER) {
        _unpause();
    }

    /**
     * @dev owner function to set the _LTV mapping
     * matching indexes in the array are mapped together,
     * EX.
     * _tokens[2] = 0xabcdef
     * _scores[2] = 3
     * _LTVs[2] = 120%
     * _LVs[2] = 100%
     * will result in a loan with token 0xabcdef at a score of 2 to have a 120% LTV and 100% LV
     */
    function setConfig(
        address[] memory _tokens,
        uint16[] memory _scores,
        uint256[] memory _LTVs,
        uint256[] memory _LTs
    ) external onlyRole(ROLE_ADMIN) {
        require(
            _tokens.length == _scores.length &&
                _scores.length == _LTVs.length &&
                _LTVs.length == _LTs.length,
            Errors.SCORE_DB_EQUAL_LENGTH
        );

        for (uint256 i = 0; i < _tokens.length; i++) {
            _scoreConfigs[_tokens[i]][_scores[i]] = Config(_LTVs[i], _LTs[i]);
        }
    }

    /**
     * @dev LTV getter
     */
    function LTV(address _token, uint16 _score) external view override returns (uint256) {
        return (_scoreConfigs[_token][_score].LTV);
    }

    /**
     * @dev LV getter
     */

    function LT(address _token, uint16 _score) external view override returns (uint256) {
        return (_scoreConfigs[_token][_score].LT);
    }
}
