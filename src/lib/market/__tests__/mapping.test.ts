import { describe, expect, it } from 'vitest';
import { heuristicYahooSymbol, marketSuffix } from '../mapping';

/**
 * Ticker formats taken from the live account. T212 does NOT use a uniform
 * `SYM_MARKET_EQ` shape: US listings carry an explicit `_US_` segment (in either
 * position) while every other exchange is a lowercase letter glued to the symbol.
 */
describe('T212 ticker → Yahoo symbol', () => {
  it('maps US listings to a bare symbol', () => {
    expect(heuristicYahooSymbol('AMZN_US_EQ', 'AMZN')).toBe('AMZN');
    expect(heuristicYahooSymbol('V_US_EQ', 'V')).toBe('V');
  });

  it('handles the transposed US form', () => {
    expect(marketSuffix('ELF_EQ_US')).toBe('');
    expect(heuristicYahooSymbol('ELF_EQ_US', 'ELF')).toBe('ELF');
  });

  it('maps the lowercase market letter to a Yahoo suffix', () => {
    expect(heuristicYahooSymbol('BPl_EQ', 'BP')).toBe('BP.L');
    expect(heuristicYahooSymbol('ADSd_EQ', 'ADS')).toBe('ADS.DE');
    expect(heuristicYahooSymbol('SHELLa_EQ', 'SHELL')).toBe('SHELL.AS');
    expect(heuristicYahooSymbol('VUAGl_EQ', 'VUAG')).toBe('VUAG.L');
  });

  it('prefers shortName so renamed tickers still resolve', () => {
    // Yahoo no longer knows FB, IPOE or LSE — only the current symbols.
    expect(heuristicYahooSymbol('FB_US_EQ', 'META')).toBe('META');
    expect(heuristicYahooSymbol('IPOE_US_EQ', 'SOFI')).toBe('SOFI');
    expect(heuristicYahooSymbol('LSEl_EQ', 'LSEG')).toBe('LSEG.L');
    expect(heuristicYahooSymbol('TRNTl_EQ', 'TRN')).toBe('TRN.L');
  });

  it('falls back to the ticker when shortName is absent', () => {
    expect(heuristicYahooSymbol('BPl_EQ', null)).toBe('BP.L');
    expect(heuristicYahooSymbol('CELH_US_EQ', null)).toBe('CELH');
    expect(heuristicYahooSymbol('ADSd_EQ', undefined)).toBe('ADS.DE');
  });

  it('strips only the market letter, not uppercase symbol characters', () => {
    expect(heuristicYahooSymbol('SGLNl_EQ', null)).toBe('SGLN.L');
    expect(heuristicYahooSymbol('VHYLl_EQ', null)).toBe('VHYL.L');
  });

  it('returns null for an unrecognised market rather than guessing', () => {
    expect(marketSuffix('WEIRD_EQ')).toBeNull();
    expect(heuristicYahooSymbol('WEIRD_EQ', 'WEIRD')).toBeNull();
  });
});
