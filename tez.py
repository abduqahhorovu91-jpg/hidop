import logging

import bot


def quiet_noisy_loggers() -> None:
    for logger_name in ("httpx", "httpcore", "telegram", "telegram.ext", "werkzeug"):
        logging.getLogger(logger_name).setLevel(logging.WARNING)


def use_health_server_only() -> None:
    original_start = bot.BackgroundWebServer.start

    def fast_start(self) -> None:
        self.flask_app = bot.health_app
        self.name = "hidop-health-server"
        return original_start(self)

    bot.BackgroundWebServer.start = fast_start


def main() -> None:
    quiet_noisy_loggers()
    use_health_server_only()
    bot.main()


if __name__ == "__main__":
    main()
