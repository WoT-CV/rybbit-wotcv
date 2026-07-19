# Rybbit

Domain language for Rybbit's analytics product, documentation, and public tools.

## Language

**Public Website Target**:
A caller-supplied HTTP or HTTPS location that resolves only to public network addresses and can be inspected by Rybbit's free analytics tools.
_Avoid_: External URL, safe URL, validated URL

**Website Inspection**:
An operation that evaluates a Public Website Target using bounded direct acquisition or a remote evaluator.
_Avoid_: URL scan, website fetch
