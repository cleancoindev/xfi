// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface IExchange {
    /**
     * Get estimation for swap of WINGS-DFI pair.
     */
    function estimateSwapWINGSForDFI(uint256 amountIn) external view returns (uint256);

    /**
     * Get estimation for swap of ETH-DFI pair.
     */
    function estimateSwapETHForDFI(uint256 amountOutMin) external view returns (uint256);

    /**
     * Get estimation for swap of DFI-WINGS pair.
     */
    function estimateSwapDFIForWINGS(uint256 amountIn) external view returns (uint256);

    /**
     * Get estimation for swap of DFI-ETH pair.
     */
    function extimateSwapDFIForETH(uint256 amountIn, uint256 amountOutMin) external view returns (uint256);

    /**
     * Execute swap of WINGS-DFI pair.
     */
    function swapWINGSForDFI(uint256 amountIn) external returns (bool);

    /**
     * Execute swap of ETH-DFI pair.
     */
    function swapETHForDFI(uint256 amountOutMin) external payable returns (bool);

    /**
     * Execute swap of DFI-WINGS pair.
     */
    function swapDFIForWINGS(uint256 amountIn) external returns (bool);

    /**
     * Execute swap of DFI-ETH pair.
     */
    function swapDFIForETH(uint256 amountIn, uint256 amountOutMin) external returns (bool);

    /**
     * Stop all swaps.
     * (access role: owner)
     */
    function stopSwaps() external returns (bool);

    /**
     * Withdraw locked WINGS.
     * (access role: owner)
     */
    function withdrawWINGS(address to, uint256 amount) external returns (bool);

    /**
     * Add owner.
     * (access role: owner)
     */
    function addOwner(address owner) external returns (bool);

    /**
     * Remove owner.
     * (access role: owner)
     */
    function removeOwner(address owner) external returns (bool);
}
