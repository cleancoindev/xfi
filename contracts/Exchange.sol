// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './interfaces/IExchange.sol';
import './interfaces/IXFIToken.sol';
import './interfaces/IUniswapV2Router.sol';

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
 *
 * Swaps involving ETH take place using Automated Liquidity Protocol - Uniswap.
 * Uniswap allows to make instant swaps between WINGS-ETH pair that
 * guarantee minimum amount of output tokens that must be received, all within
 * a single transaction.
 */
contract Exchange is AccessControl, ReentrancyGuard, IExchange {
    IERC20 private immutable _wingsToken;
    IXFIToken private immutable _xfiToken;
    IUniswapV2Router private immutable _uniswapRouter;

    bool private _stopped = false;
    uint256 private _deadline;

    /**
     * Sets {DEFAULT_ADMIN_ROLE} (alias `owner`) role for caller.
     * Initializes Wings Token, XFI Token and Uniswap Router.
     */
    constructor (address wingsToken_, address xfiToken_, address uniswapRouter_, uint256 deadline_) public {
        require(deadline_ > block.timestamp, 'Exchange: deadline must be great than current timestamp');
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _wingsToken = IERC20(wingsToken_);
        _xfiToken = IXFIToken(xfiToken_);
        _uniswapRouter = IUniswapV2Router(uniswapRouter_);
        _deadline = deadline_;
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

    function deadline() external view override returns (uint256) {
        return _deadline;
    }

    /**
     * Returns the address of the Uniswap Router.
     */
    function uniswapRouter() external view override returns (address) {
        return address(_uniswapRouter);
    }

    /**
     * Returns `amounts` estimation for swap of WINGS-XFI pair (1:1 ratio).
     */
    function estimateSwapWINGSForXFI(uint256 amountIn) public view override returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;
    }

    /**
     * Returns `amounts` estimation for swap of ETH-XFI pair.
     */
    function estimateSwapETHForXFI(uint256 amountIn) external view override returns (uint256[] memory amounts) {
        address[] memory path = new address[](2);
        path[0] = _uniswapRouter.WETH();
        path[1] = address(_wingsToken);

        amounts = _uniswapRouter.getAmountsOut(amountIn, path);
    }

    /**
     * Returns whether swapping is stopped.
     */
    function isSwappingStopped() external view override returns (bool) {
        return _stopped;
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
     * - Contract is not stopped.
     * - Contract is approved to spend `amountIn` of WINGS tokens.
     */
    function swapWINGSForXFI(uint256 amountIn) external override nonReentrant returns (uint256[] memory amounts) {
        _beforeSwap();

        amounts = estimateSwapWINGSForXFI(amountIn);

        require(_wingsToken.transferFrom(msg.sender, address(this), amounts[0]), 'Exchange: WINGS transferFrom failed');
        require(_xfiToken.mint(msg.sender, amounts[amounts.length - 1]), 'Exchange: XFI mint failed');

        emit SwapWINGSForXFI(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Executes swap of ETH-XFI pair.
     *
     * Emits a {SwapETHForXFI} event.
     *
     * Returns:
     * - `amounts` the input token amount and all subsequent output token amounts.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function swapETHForXFI(uint256 amountOutMin) external payable override nonReentrant returns (uint256[] memory amounts) {
        _beforeSwap();

        address[] memory path = new address[](2);
        path[0] = _uniswapRouter.WETH();
        path[1] = address(_wingsToken);

        amounts = _uniswapRouter.swapExactETHForTokens{value: msg.value}(amountOutMin, path, address(this), block.timestamp);

        require(amounts[amounts.length - 1] >= amountOutMin, 'Exchange: ETH-XFI swap failed');

        require(_xfiToken.mint(msg.sender, amounts[amounts.length - 1]), 'Exchange: XFI mint failed');

        emit SwapETHForXFI(msg.sender, amounts[0], amounts[amounts.length - 1]);
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
     * Change deadline timestamp.
     *
     * Emits a {DeadlineChanged} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Deadline must be great than current timestamp.
     */
     function changeDeadline(uint256 deadline_) external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Exchange: sender is not owner');
        require(deadline_ > block.timestamp, 'Exchange: deadline must be great than current timestamp');

        _deadline = deadline_;

        emit DeadlineChanged(deadline_);
        
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
      */
    function withdrawWINGS(address to, uint256 amount) external override nonReentrant returns (bool) {
        require(to != address(0), 'Exchange: withdraw to the zero address');
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Exchange: sender is not owner');

        require(_wingsToken.transfer(to, amount), 'Exchange: WINGS transfer failed');

        emit WINGSWithdrawal(to, amount);

        return true;
    }

    /**
     * Executes before swap hook.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function _beforeSwap() internal view {
        require(!_stopped, 'Exchange: swapping is stopped');
        require(block.timestamp <= _deadline, 'Exchange: swapping is rotten');
    }
}
