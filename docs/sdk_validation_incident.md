# Incident Report: Google GenAI SDK & Pydantic Validation Mismatch

## 🚨 The Issue
We encountered a persistent `Pydantic Validation Error` when trying to use the `thinking_level="low"` parameter with the **Gemini 3.0 Pro** model using the `google-genai` Python SDK (v1.47.0).

**Error Message:**
```
thinking_config.thinking_level
  Extra inputs are not permitted [type=extra_forbidden, input_value='low', input_type=str]
```

## 🔍 Root Cause
1. **Documentation vs. SDK Mismatch:** The [Google GenAI API documentation](https://ai.google.dev/gemini-api/docs/gemini-3?thinking=low) states that `thinking_level` is a valid parameter.
2. **Outdated Client Types:** However, the released Python SDK (`google-genai==1.47.0`) has **Pydantic models** that define `ThinkingConfig` *without* the `thinking_level` field.
3. **Strict Validation:** The SDK uses Pydantic for strict client-side validation. When we passed `thinking_level`, the SDK intercepted the request and blocked it locally before it could ever reach Google's servers.

## 🛠️ The Fix
We had to **bypass client-side validation** to force the SDK to send the parameters exactly as we wanted them.

**Incorrect Approach (Blocked by Pydantic):**
```python
# Fails because ThinkingConfig doesn't have 'thinking_level' in v1.47.0
config = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_level="low")
)
```

**Correct Approach (The "God Mode" Bypass):**
Use `.model_construct()` to create the Pydantic model without validating the fields. This forces the object to be created even if the fields don't match the schema.

```python
# ✅ WORKS: Creates the object blindly, ignoring the missing field definition
thinking_cfg = types.ThinkingConfig.model_construct(
    thinking_level="low"
)

config = types.GenerateContentConfig.model_construct(
    thinking_config=thinking_cfg
)
```

## 🛡️ Prevention & Best Practices
How to avoid this in the future when working with bleeding-edge APIs:

1.  **Trust the API, Not the SDK:** If the REST API docs say a parameter exists but the SDK throws a validation error, the SDK is likely outdated.
2.  **Use `model_construct`:** When you need to send a field that you *know* is valid (from docs) but the library says is invalid, use `model_construct()` to bypass Pydantic validation.
3.  **Check SDK Versions:** Always check `pip show google-genai` to see if a newer version has been released that includes the updated types.
4.  **Raw Dicts (Alternative):** If `model_construct` fails, you can sometimes pass a raw Python dictionary (JSON) to the API client methods, provided the method signature accepts `Dict[str, Any]`.

---
*Saved to `docs/sdk_validation_incident.md`*

