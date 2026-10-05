export HOME=<scratchpad>/ocA/home XDG_CONFIG_HOME=<scratchpad>/ocA/cfg XDG_DATA_HOME=<scratchpad>/ocA/data XDG_CACHE_HOME=<scratchpad>/ocA/cache XDG_STATE_HOME=<scratchpad>/ocA/state
export OPENCODE_DISABLE_AUTOUPDATE=1 OPENCODE_DISABLE_MODELS_FETCH=1
export PATH=<scratchpad>/bin/opencode/node_modules/.bin:$PATH
mk() { # mode -> provider json
  echo "\"f$1\":{\"npm\":\"@ai-sdk/openai-compatible\",\"name\":\"F$1\",\"options\":{\"baseURL\":\"http://127.0.0.1:18731/$1/v1\",\"apiKey\":\"{env:FAKE_KEY}\"},\"models\":{\"fake-model\":{\"name\":\"Fake\"}}}"
}
export FAKE_KEY=sk-test-123
export OPENCODE_CONFIG_CONTENT="{\"$schema\":\"https://opencode.ai/config.json\",\"provider\":{$(mk ok),$(mk tool),$(mk e400),$(mk e401),$(mk e429),$(mk e500)},\"model\":\"fok/fake-model\"}"
