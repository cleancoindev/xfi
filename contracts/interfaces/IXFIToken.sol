// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import './IERC20.sol';

/**
 * XFI token extends the interface of ERC20 standard.
 */
interface IXFIToken is IERC20 {
    event StartDateChanged(uint256 newStartDate, uint256 newVestingDeadline, uint256 newReserveFrozenUntil);
    event TransfersStarted();
    event TransfersStopped();
    event ReserveWithdrawal(address indexed to, uint256 amount);

    function isTransferringStopped() external view returns (bool);
    function burnFrom(address account, uint256 amount) external returns (bool);
    function VESTING_DURATION() external view returns (uint256);
    function RESERVE_FREEZE_PERIOD() external view returns (uint256);
    function MAX_TOTAL_SUPPLY() external view returns (uint256);
    function startDate() external view returns (uint256);
    function vestingDeadline() external view returns (uint256);
    function reserveFrozenUntil() external view returns (uint256);
    function getReserveAmount() external view returns (uint256);
    function daysSinceStart() external view returns (uint256);
    function vestingEndsInDays() external view returns (uint256);
    function convertAmountUsingRatio(uint256 amount) external view returns (uint256);
    function convertAmountUsingReverseRatio(uint256 amount) external view returns (uint256);
    function totalVestedBalanceOf(address account) external view returns (uint256);
    function unspentVestedBalanceOf(address account) external view returns (uint256);
    function spentVestedBalanceOf(address account) external view returns (uint256);

    function mint(address account, uint256 amount) external returns (bool);
    function burn(uint256 amount) external returns (bool);
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function startTransfers() external returns (bool);
    function stopTransfers() external returns (bool);
    function changeStartDate(uint256 startDate_) external returns (bool);
    function withdrawReserve(address to) external returns (bool);
}
