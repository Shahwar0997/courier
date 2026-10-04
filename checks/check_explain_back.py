"""Stop 1 check (and every stop after): did you write your explain-back in the pull request?

CI runs this on pull requests only (job stop-01). It reads the PR description from the
PR_BODY environment variable and looks for your answer under the heading
"What does this change make the robot do, and why this way?". It checks that there is an
answer, not what it says: the answer is for you and your reviewer.
"""

import os
import re
import sys

QUESTION = "What does this change make the robot do"
MESSAGE = "✗ Add one sentence under 'What does this change make the robot do?' in your PR description."


def github_error(message):
    """On GitHub, also say it as an error annotation: the workshop's PR panel shows that line."""
    if os.environ.get("GITHUB_ACTIONS") == "true":
        line = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error::{line}")


def answer(body):
    """Return the text written under the explain-back heading, without template comments."""
    body = re.sub(r"<!--.*?-->", "", body or "", flags=re.S)
    lines = body.splitlines()
    for i, line in enumerate(lines):
        if QUESTION in line:
            written = []
            for rest in lines[i + 1 :]:
                if rest.lstrip().startswith("#"):
                    break
                written.append(rest)
            return "\n".join(written).strip()
    return ""


def main():
    if answer(os.environ.get("PR_BODY", "")):
        print("✓ Explain-back written. Thanks: your reviewer (and future you) will read it.")
        return 0
    print(MESSAGE)
    github_error(MESSAGE)
    return 1


if __name__ == "__main__":
    sys.exit(main())
