// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './interfaces/IExchange.sol';
import './interfaces/IXFIToken.sol';

/**
 * Implementation of the {IExchange} interface.
 *
 * Ethereum XFI Exchange allows Ethereum accounts to convert their WINGS or ETH
 * to XFI and vice versa.
 *
 * Swap between WINGS and XFI happens with a 1:1 ratio.
 *
 * To enable swap the Exchange plays a role of a storage for WINGS tokens as
 * well as a minter of XFI Tokens.
 */
contract Exchange is AccessControl, ReentrancyGuard, IExchange {
    using SafeMath for uint256;

    IERC20 private immutable _wingsToken;
    IXFIToken private immutable _xfiToken;

    bool private _stopped = false;
    uint256 private _maxGasPrice;

    /**
     * Sets {DEFAULT_ADMIN_ROLE} (alias `owner`) role for caller.
     * Initializes Wings Token, XFI Token.
     */
    constructor (address wingsToken_, address xfiToken_) public {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _wingsToken = IERC20(wingsToken_);
        _xfiToken = IXFIToken(xfiToken_);
    }

    /**
     * Executes swap of WINGS-XFI pair.
     *
     * Emits a {SwapWINGSForXFI} event.
     *
     * Returns:
     * - `amounts` the input token amount and all subsequent output token amounts.
     *
     * Requirements:
     * - Contract is approved to spend `amountIn` of WINGS tokens.
     */
    function swapWINGSForXFI(uint256 amountIn) external override nonReentrant returns (uint256[] memory amounts) {
        _beforeSwap();

        uint256 amountOut = _calculateSwapAmount(amountIn);

        amounts = new uint256[](2);
        amounts[0] = amountIn;

        amounts[1] = amountOut;

        require(_wingsToken.transferFrom(msg.sender, address(this), amounts[0]), 'Exchange: WINGS transferFrom failed');
        require(_xfiToken.mint(msg.sender, amounts[amounts.length - 1]), 'Exchange: XFI mint failed');

        emit SwapWINGSForXFI(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Starts all swaps.
     *
     * Emits a {SwapsStarted} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Contract is stopped.
     */
    function startSwaps() external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Exchange: sender is not owner');
        require(_stopped, 'Exchange: swapping is not stopped');

        _stopped = false;

        emit SwapsStarted();

        return true;
    }

    /**
     * Stops all swaps.
     *
     * Emits a {SwapsStopped} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Contract is not stopped.
     */
    function stopSwaps() external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Exchange: sender is not owner');
        require(!_stopped, 'Exchange: swapping is stopped');

        _stopped = true;

        emit SwapsStopped();

        return true;
    }

     /**
      * Withdraws `amount` of locked WINGS to a destination specified as `to`.
      *
      * Emits a {WINGSWithdrawal} event.
      *
      * Requirements:
      * - `to` cannot be the zero address.
      * - Caller must have owner role.
      * - Swapping has ended.
      */
    function withdrawWINGS(address to, uint256 amount) external override nonReentrant returns (bool) {
        require(to != address(0), 'Exchange: withdraw to the zero address');
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Exchange: sender is not owner');
        require(block.timestamp > _xfiToken.vestingEnd(), 'Exchange: swapping has not ended');

        require(_wingsToken.transfer(to, amount), 'Exchange: WINGS transfer failed');

        emit WINGSWithdrawal(to, amount);

        return true;
    }

    /**
     * Sets maximum gas price for swap to `maxGasPrice_`.
     *
     * Emits a {MaxGasPriceUpdated} event.
     *
     * Requirements:
     * - Caller must have owner role.
     */
    function setMaxGasPrice(uint256 maxGasPrice_) external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Exchange: sender is not owner');

        _maxGasPrice = maxGasPrice_;

        emit MaxGasPriceChanged(maxGasPrice_);

        return true;
    }

    /**
     * Returns the address of the Wings Token.
     */
    function wingsToken() external view override returns (address) {
        return address(_wingsToken);
    }

    /**
     * Returns the address of the XFI Token.
     */
    function xfiToken() external view override returns (address) {
        return address(_xfiToken);
    }

    /**
     * Returns `amount` XFI estimation that user will receive per day after the swap of WINGS-XFI pair.
     */
    function estimateSwapWINGSForXFIPerDay(uint256 amountIn) external view override returns (uint256 amount) {
        uint256[] memory amounts = estimateSwapWINGSForXFI(amountIn);

        amount = amounts[1].div(_xfiToken.VESTING_DURATION_DAYS());
    }


    /**
     * Returns whether swapping is stopped.
     */
    function isSwappingStopped() external view override returns (bool) {
        return _stopped;
    }

    /**
     * Returns maximum gas price for swap. If set, any swap transaction that has
     * a gas price exceeding this limit will be reverted.
     */
    function maxGasPrice() external view override returns (uint256) {
        return _maxGasPrice;
    }

    /**
     * Returns `amounts` estimation for swap of WINGS-XFI pair.
     */
    function estimateSwapWINGSForXFI(uint256 amountIn) public view override returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;

        uint256 amountOut = _calculateSwapAmount(amounts[0]);

        amounts[1] = amountOut;
    }

    /**
     * Executes before swap hook.
     *
     * Requirements:
     * - Contract is not stopped.
     * - Swapping has started.
     * - Swapping hasn't ended.
     * - Gas price doesn't exceed the limit (if set).
     */
    function _beforeSwap() internal view {
        require(!_stopped, 'Exchange: swapping is stopped');
        require(block.timestamp >= _xfiToken.vestingStart(), 'Exchange: swapping has not started');
        require(block.timestamp <= _xfiToken.vestingEnd(), 'Exchange: swapping has ended');

        if (_maxGasPrice > 0) {
            require(tx.gasprice <= _maxGasPrice, 'Exchange: gas price exceeds the limit');
        }
    }

    /**
     * Convert input amount to the output XFI amount using timed swap ratio.
     */
    function _calculateSwapAmount(uint256 amount) internal view returns (uint256) {
        require(amount >= 182, 'Exchange: minimum XFI swap output amount is 182 * 10 ** -18');

        if (block.timestamp < _xfiToken.vestingEnd()) {
            uint256 amountOut = _xfiToken.convertAmountUsingReverseRatio(amount);

            return amountOut;
        } else {
            return 0;
        }
    }
}
