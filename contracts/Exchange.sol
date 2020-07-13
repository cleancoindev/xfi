// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './interfaces/IExchange.sol';
import './interfaces/IDFIToken.sol';
import './interfaces/IUniswapV2Router.sol';

/**
 * Implementation of the {IExchange} interface.
 *
 * Ethereum DFI Exchange allows Ethereum accounts to convert their WINGS or ETH
 * to DFI and vice versa.
 *
 * Swap between WINGS and DFI happens with a 1:1 ratio.
 *
 * To enable swap the Exchange plays a role of a storage for WINGS tokens as
 * well as a minter of DFI Tokens.
 *
 * Swaps involving ETH take place using Automated Liquidity Protocol - Uniswap.
 * Uniswap allows to make instant swaps between WINGS-ETH pair that
 * guarantee minimum amount of output tokens that must be received, all within
 * a single transaction.
 */
contract Exchange is AccessControl, ReentrancyGuard, IExchange {
    IERC20 private immutable _wingsToken;
    IDFIToken private immutable _dfiToken;
    IUniswapV2Router private immutable _uniswapRouter;

    bool private _stopped = false;

    /**
     * Sets {DEFAULT_ADMIN_ROLE} (alias `owner`) role for caller.
     * Initializes Wings Token, DFI Token and Uniswap Router.
     */
    constructor (address wingsToken_, address dfiToken_, address uniswapRouter_) public {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _wingsToken = IERC20(wingsToken_);
        _dfiToken = IDFIToken(dfiToken_);
        _uniswapRouter = IUniswapV2Router(uniswapRouter_);
    }

    /**
     * Returns the address of the Wings Token.
     */
    function wingsToken() external view override returns (address) {
        return address(_wingsToken);
    }

    /**
     * Returns the address of the DFI Token.
     */
    function dfiToken() external view override returns (address) {
        return address(_dfiToken);
    }

    /**
     * Returns the address of the Uniswap Router.
     */
    function uniswapRouter() external view override returns (address) {
        return address(_uniswapRouter);
    }

    /**
     * Returns `amounts` estimation for swap of WINGS-DFI pair (1:1 ratio).
     */
    function estimateSwapWINGSForDFI(uint256 amountIn) public view override returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;
    }

    /**
     * Returns `amounts` estimation for swap of ETH-DFI pair.
     */
    function estimateSwapETHForDFI(uint256 amountIn) external view override returns (uint256[] memory amounts) {
        address[] memory path = new address[](2);
        path[0] = _uniswapRouter.WETH();
        path[1] = address(_wingsToken);

        amounts = _uniswapRouter.getAmountsOut(amountIn, path);
    }

    /**
     * Returns `amounts` estimation for swap of DFI-WINGS pair (1:1 ratio).
     */
    function estimateSwapDFIForWINGS(uint256 amountIn) public view override returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;
    }

    /**
     * Returns `amounts` estimation for swap of DFI-ETH pair.
     */
    function estimateSwapDFIForETH(uint256 amountIn) external view override returns (uint256[] memory amounts) {
        address[] memory path = new address[](2);
        path[0] = address(_wingsToken);
        path[1] = _uniswapRouter.WETH();

        amounts = _uniswapRouter.getAmountsOut(amountIn, path);
    }

    /**
     * Returns whether swapping is stopped.
     */
    function isSwappingStopped() external view override returns (bool) {
        return _stopped;
    }

    /**
     * Executes swap of WINGS-DFI pair.
     *
     * Emits a {SwapWINGSForDFI} event.
     *
     * Returns:
     * - `amounts` the input token amount and all subsequent output token amounts.
     *
     * Requirements:
     * - Contract is not stopped.
     * - Contract is approved to spend `amountIn` of WINGS tokens.
     */
    function swapWINGSForDFI(uint256 amountIn) external override nonReentrant returns (uint256[] memory amounts) {
        _beforeSwap();

        amounts = estimateSwapWINGSForDFI(amountIn);

        require(_wingsToken.transferFrom(msg.sender, address(this), amounts[0]), 'Exchange: WINGS transferFrom failed');
        require(_dfiToken.mint(msg.sender, amounts[amounts.length - 1]), 'Exchange: DFI mint failed');

        emit SwapWINGSForDFI(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Executes swap of ETH-DFI pair.
     *
     * Emits a {SwapETHForDFI} event.
     *
     * Returns:
     * - `amounts` the input token amount and all subsequent output token amounts.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function swapETHForDFI(uint256 amountOutMin) external payable override nonReentrant returns (uint256[] memory amounts) {
        _beforeSwap();

        address[] memory path = new address[](2);
        path[0] = _uniswapRouter.WETH();
        path[1] = address(_wingsToken);

        amounts = _uniswapRouter.swapExactETHForTokens{value: msg.value}(amountOutMin, path, address(this), block.timestamp);

        require(_dfiToken.mint(msg.sender, amounts[amounts.length - 1]), 'Exchange: DFI mint failed');

        emit SwapETHForDFI(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Executes swap of DFI-WINGS pair.
     *
     * Emits a {SwapDFIForWINGS} event.
     *
     * Returns:
     * - `amounts` the input token amount and all subsequent output token amounts.
     *
     * Requirements:
     * - Contract is not stopped.
     * - Contract is approved to spend `amountIn` of DFI tokens.
     */
    function swapDFIForWINGS(uint256 amountIn) external override nonReentrant returns (uint256[] memory amounts) {
        _beforeSwap();

        amounts = estimateSwapDFIForWINGS(amountIn);

        require(_dfiToken.transferFrom(msg.sender, address(this), amountIn), 'Exchange: DFI transferFrom failed');
        require(_dfiToken.burn(address(this), amountIn), 'Exchange: DFI burn failed');
        require(_wingsToken.transfer(msg.sender, amounts[amounts.length - 1]), 'Exchange: WINGS transfer failed');

        emit SwapDFIForWINGS(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Executes swap of DFI-ETH pair.
     *
     * Emits a {SwapDFIForETH} event.
     *
     * Returns:
     * - `amounts` the input token amount and all subsequent output token amounts.
     *
     * Requirements:
     * - Contract is not stopped.
     * - Contract is approved to spend `amountIn` of DFI tokens.
     */
    function swapDFIForETH(uint256 amountIn, uint256 amountOutMin) external override nonReentrant returns (uint256[] memory amounts) {
        _beforeSwap();

        require(_dfiToken.transferFrom(msg.sender, address(this), amountIn), 'Exchange: DFI transferFrom failed');
        require(_dfiToken.burn(address(this), amountIn), 'Exchange: DFI burn failed');
        require(_wingsToken.approve(address(_uniswapRouter), amountIn), 'Exchange: WINGS approve failed');

        address[] memory path = new address[](2);
        path[0] = address(_wingsToken);
        path[1] = _uniswapRouter.WETH();

        amounts = _uniswapRouter.swapExactTokensForETH(amountIn, amountOutMin, path, msg.sender, block.timestamp);

        emit SwapDFIForETH(msg.sender, amounts[0], amounts[amounts.length - 1]);
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
    }
}
