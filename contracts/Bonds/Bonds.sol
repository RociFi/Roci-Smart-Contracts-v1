/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../interfaces/IBonds.sol";

import {IERC20PaymentStandard} from "../interfaces/newInterfaces/payment/IERC20PaymentStandard.sol";
import {ONE_HUNDRED_PERCENT} from "../Globals.sol";
import {Errors} from "../libraries/Errors.sol";

/**
 * @title Bonds
 * @author RociFI Labs
 * @notice Bonds mints ERC1155 tokens that represent ownership of a loan specified by a Payment Contract. These bonds can accrue interest and be exchanged for payments made in the payment contract
 */
contract Bonds is ERC1155, IBonds {
    using ECDSA for bytes32;

    //Stores ID-> payment contract relationships
    mapping(uint256 => address) public override IDToContract;

    /// @notice A linked list is used to keep track of staking for each user. This is so we can delete (ustake) nodes in constant time while still being able to itterate easily
    /// @dev may one day use this in payment standard as well to itterate through loans per person.
    //Data held per person to keep track of staking
    struct IOU {
        uint256 ID;
        uint256 amount;
        uint256 timeStaked;
    }

    //Node for a linked list
    struct node {
        uint256 last;
        uint256 next;
        IOU value;
    }

    //In the linked list the head is always 0. Head actually represents null. There will never be a value stored there
    uint256 public constant override head = 0;

    //Used to keep track of this info for each user's linked list of staking data
    mapping(address => uint256) public override llTail;

    /// @notice this is the staking linked list. Access the node to find the next/last.The 0 node is the HEAD and cannot hold values. If HEAD points to
    /// itself then it's empty
    mapping(address => mapping(uint256 => node)) staking;

    //Constructor. Empty for now except the metadata url
    constructor() ERC1155("https://test.com/api/{id}.json") {}

    /**
     * @notice Staking mapping is no longer public. Must call this to get staking info
     * @param _who is address in first mapping
     * @param _index is LL index in nested mapping
     * @return the Linked List Node last pointer
     * @return the Linked List Node next pointer
     * @return the IOU struct Loan ID value
     * @return the IOU struct amount value
     * @return the IOU struct timestamp for staking
     * in that order
     */
    function getStakingAt(address _who, uint256 _index)
        external
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        node memory n = staking[_who][_index];
        return (n.last, n.next, n.value.ID, n.value.amount, n.value.timeStaked);
    }

    /**
     * @notice function creates the tokens for a new loan so they can be sold to generate funding
     * @param _paymentContractAddress is the address of the loan's contract. "Borrower" in this
     * @param _id is the ID of the loan you're minting
     * @param _hash is the hash of the previous two parameters in order
     * @param _signature is the signature of that data. Must be signed by the borrower
     */
    function newLoan(
        address _paymentContractAddress,
        uint256 _id,
        bytes32 _hash,
        bytes memory _signature
    ) external override {
        // compute the hash of the data and verify it matches the hash provided

        require(
            keccak256(abi.encode(_paymentContractAddress, _id)) == _hash,
            Errors.BONDS_HASH_AND_ENCODING
        );
        //
        // use the signature to recover the user who signed this message
        address user = _hash.toEthSignedMessageHash().recover(_signature);

        IERC20PaymentStandard pc = IERC20PaymentStandard(_paymentContractAddress);
        uint256 amm;
        address creator;
        (amm, creator) = pc.issueBonds(_id);
        require(user == creator, Errors.BONDS_BORROWER_SIGNATURE);
        IDToContract[_id] = _paymentContractAddress;
        _mint(msg.sender, _id, amm, ""); // Mints to sender not creator. Since we have this signature feature so bonds can be minted on someone elses behalf
    }

    /**
     * @notice function stakes an amount of ERC-1155's with id from sender. MUST Approve contract first
     * @param _id is the token's id
     * @param _amm is the amount to stake
     */
    function stake(uint256 _id, uint256 _amm) external override returns (uint256) {
        safeTransferFrom(msg.sender, address(this), _id, _amm, "");
        _push(IOU(_id, _amm, block.timestamp), msg.sender);
        return llTail[msg.sender];
    }

    /**
     * @notice function unstakes bonds
     * @param _index is the index in the linked list mentioned above with state varaibles
     */
    function unstake(uint256 _index) external override {
        require(!_isEmpty(msg.sender), Errors.BONDS_NOT_STACKING);
        //Get some important variables
        uint256 id = staking[msg.sender][_index].value.ID;
        uint256 amm = staking[msg.sender][_index].value.amount;
        address paymentContract = IDToContract[id];

        // must get amout to mint BEFORE you _del the staking
        IERC20PaymentStandard pc = IERC20PaymentStandard(paymentContract);
        uint256 interest = pc.loanLookup(id).interestRate;
        uint256 toMint = getInterest(msg.sender, _index, amm, interest);

        //Remove staking from the ll
        _del(_index, msg.sender);
        //Update the balance with new interest
        pc.addInterest(toMint, id);
        _safeTransferFrom(address(this), msg.sender, id, amm, "");
        _mint(msg.sender, id, toMint, "");
    }

    /**
     * @dev getter function for a loan's interest
     */
    function getInterest(
        address _staker,
        uint256 _index,
        uint256 _stakingAmount,
        uint256 _interest
    ) public view override returns (uint256) {
        uint256 periodsStaked = getAccruances(_staker, _index);
        return (periodsStaked * ((_stakingAmount * _interest) / ONE_HUNDRED_PERCENT));
    }

    /**
     * @notice function get's how many accruance periods a person has staked through
     * @param _who is who to check
     * @param _index in the linked list
     * @return the number of periods
     */
    function getAccruances(address _who, uint256 _index) public view override returns (uint256) {
        IOU memory iou = staking[_who][_index].value;
        require(iou.ID != 0, Errors.BONDS_NOT_STACKING_INDEX);
        address paymentContract = IDToContract[iou.ID];
        IERC20PaymentStandard pc = IERC20PaymentStandard(paymentContract);
        uint256 accrualPeriod = pc.loanLookup(iou.ID).accrualPeriod;
        return ((block.timestamp - iou.timeStaked) / accrualPeriod);
    }

    /// @notice ERC1155 receiver function
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    /// @notice ERC1155 batch receiver function
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    /*=============================================================
    *LINKED LIST FUNCTIONS
    *BELLOW
    ==============================================================*/

    /**
     * @notice helper function
     * @param _who to lookup the linked list of
     * @return if ll is empty
     */
    function _isEmpty(address _who) private view returns (bool) {
        return (staking[_who][head].next == 0);
    }

    /** @notice push to tail of linkedList
     * @param _val is the value to insert at tail
     * @param _who is who to push in ll mapping
     */
    function _push(IOU memory _val, address _who) private {
        uint256 tail = llTail[_who];
        if (_isEmpty(_who)) {
            staking[_who][head].next = 1;
            staking[_who][1] = node(0, 0, _val);
            llTail[_who] = 1;
        } else {
            staking[_who][tail].next = tail + 1;
            staking[_who][tail + 1] = node(tail, 0, _val);
            llTail[_who]++;
        }
    }

    /** @notice delete at a given index
     * @param _index is the pointer to the node
     * @param _who is who in ll mapping
     */
    function _del(uint256 _index, address _who) private {
        uint256 tail = llTail[_who];
        require(_index != head, Errors.BONDS_DELETE_HEAD);
        if (_index == tail) {
            llTail[_who] = staking[_who][tail].last;
        }
        uint256 a = staking[_who][_index].last;
        uint256 b = staking[_who][_index].next;
        staking[_who][a].next = staking[_who][_index].next;
        staking[_who][b].last = staking[_who][_index].last;

        staking[msg.sender][_index].value = IOU(0, 0, 0);
        staking[msg.sender][_index].next = 0;
        staking[msg.sender][_index].last = 0;
    }
}
