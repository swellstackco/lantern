# Build notes

## Decisions from Ben (applied)
- Name: Lantern (final; one constant in packages/shared/src/config.ts).
- No AWS at all: no Bedrock, SES, Lambda, DynamoDB. T12 and T14 dropped. Brain = mock/scripted by default behind a provider interface. Caregiver alerts go to the local outbox (UI + files).
- Public repo github.com/swellstackco/lantern (MIT, LICENSE present). Ben creates the remote at submit time.
- Browser speechSynthesis for the simulator voice is OK.

## Spec calls
- Drift rule (SPEC section 4 literal: EWMA <= -1.0 for 10 consecutive days) cannot fire sooner than drift day 18 even for a constant -1.2 shift, which contradicts T3 test (c) (days 10-14). Call made: a domain qualifies when its EWMA stayed <= -0.5 for 10+ consecutive scored days (>= 8 obs) AND is <= -1.0 today. Notice = 2+ domains, or 1 domain at <= -1.5. Watch = 1 domain. One outlier day (z=-3) still cannot qualify.
- Baseline split-half r is floored at 0.5 (within-person split-half of a stable series is near zero); placeholder until validation data.
