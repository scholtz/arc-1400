# ARC-1400 Suite Documentation

This directory contains draft Algorand Request for Comments (ARC) specifications adapting the Ethereum ERC-1400 security token family to Algorand.

| File          | Title                          | Status | Summary                                                                |
| ------------- | ------------------------------ | ------ | ---------------------------------------------------------------------- |
| `ARC-1400.md` | Security Token Standard Suite  | Draft  | Umbrella spec describing suite composition and mappings.               |
| `ARC-1594.md` | Core Security Token Operations | Draft  | Issuance, redemption, and transfer validation with standardized codes. |
| `ARC-1410.md` | Partitioned Token Balances     | Draft  | Logical balance partitions for a single ARC-200 token.                 |
| `ARC-1643.md` | Document Registry              | Draft  | Integrity-protected off-chain document references.                     |
| `ARC-1644.md` | Controller Operations          | Draft  | Forced transfer/redeem governance actions.                             |

## Conventions

- Status values follow: Draft → Review → Final.
- All specs released under CC0 1.0.
- ABI method names are recommendations; implementers MUST preserve semantics.

## Next Steps

- Incorporate community feedback.
- Provide reference TEAL / TypeScript implementations.
- Add conformance test suite.

## License

CC0 1.0 Universal.
