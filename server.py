import logging
import os

from bot import bootstrap_runtime_state, web_app


def main() -> None:
    bootstrap_runtime_state()
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    port = int(os.getenv("PORT", 8000))
    web_app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False, threaded=True)


if __name__ == "__main__":
    main()
