#!/usr/bin/env python3
"""Narrow Graphify's generated OpenCode skill trigger in its frontmatter."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


DESCRIPTION = (
    "Use only for explicit Graphify requests or questions answered from an existing "
    "graphify-out/graph.json. Build, update, query, or export a knowledge graph."
)


class SkillFormatError(ValueError):
    """Raised when the generated skill frontmatter cannot be safely edited."""


def line_content(line: str) -> str:
    if line.endswith("\r\n"):
        return line[:-2]
    if line.endswith(("\n", "\r")):
        return line[:-1]
    return line


def line_ending(line: str) -> str:
    if line.endswith("\r\n"):
        return "\r\n"
    if line.endswith("\n"):
        return "\n"
    if line.endswith("\r"):
        return "\r"
    return ""


def find_frontmatter_end(lines: list[str]) -> int:
    if not lines or line_content(lines[0]) != "---":
        raise SkillFormatError("opening frontmatter delimiter '---' is missing or invalid")

    for index in range(1, len(lines)):
        if line_content(lines[index]) == "---":
            if index + 1 < len(lines) and line_content(lines[index + 1]) == "---":
                raise SkillFormatError("duplicate frontmatter block")
            return index

    raise SkillFormatError("closing frontmatter delimiter '---' is missing")


def replace_description(text: str) -> str:
    lines = text.splitlines(keepends=True)
    closing = find_frontmatter_end(lines)
    fields = [
        index
        for index in range(1, closing)
        if re.match(r"^description[ \t]*:", line_content(lines[index]))
    ]
    if not fields:
        raise SkillFormatError("description field is missing from frontmatter")
    if len(fields) > 1:
        raise SkillFormatError("duplicate description fields in frontmatter")

    index = fields[0]
    original_line = lines[index]
    content = line_content(original_line)
    prefix_match = re.match(r"^(description[ \t]*:[ \t]*)", content)
    if prefix_match is None:
        raise SkillFormatError("invalid description field")
    prefix = prefix_match.group(1)
    value = content[len(prefix) :]

    block_match = re.fullmatch(
        r"(?P<indicator>[>|](?:(?:[+-][1-9]?)|(?:[1-9][+-]?))?)"
        r"(?P<suffix>[ \t]*(?:#.*)?)",
        value.strip(),
    )
    if block_match is not None:
        block_end = index + 1
        indentation: str | None = None
        while block_end < closing:
            block_line = line_content(lines[block_end])
            if not block_line.strip():
                block_end += 1
                continue
            leading = block_line[: len(block_line) - len(block_line.lstrip(" \t"))]
            if not leading:
                break
            if "\t" in leading:
                raise SkillFormatError("invalid tab indentation in description block")
            if indentation is None:
                indentation = leading
            block_end += 1

        if indentation is None:
            raise SkillFormatError("description block has no content")

        # Retain trailing blank lines and their placement; they are part of the
        # block scalar in YAML and may separate the field from later metadata.
        content_end = block_end
        while (
            content_end > index + 1
            and not line_content(lines[content_end - 1]).strip()
        ):
            content_end -= 1
        replacement = [
            original_line,
            indentation + DESCRIPTION + (line_ending(original_line) or "\n"),
            *lines[content_end:block_end],
        ]
        return "".join(lines[:index] + replacement + lines[block_end:])

    double_quoted = re.fullmatch(
        r'(?P<scalar>"(?:\\.|[^"\\])*")(?P<suffix>[ \t]*(?:#.*)?)', value
    )
    single_quoted = re.fullmatch(
        r"(?P<scalar>'(?:[^']|'')*')(?P<suffix>[ \t]*(?:#.*)?)", value
    )
    match = double_quoted or single_quoted
    if match is None or len(match.group("scalar")) == 2:
        raise SkillFormatError(
            "invalid description; expected a quoted scalar or YAML block scalar"
        )

    scalar = (
        json.dumps(DESCRIPTION, ensure_ascii=False)
        if match is double_quoted
        else "'" + DESCRIPTION.replace("'", "''") + "'"
    )
    replacement_line = (
        prefix + scalar + match.group("suffix") + line_ending(original_line)
    )
    return "".join(lines[:index] + [replacement_line] + lines[index + 1 :])


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {Path(argv[0]).name} SKILL.md", file=sys.stderr)
        return 2

    path = Path(argv[1])
    try:
        with path.open("r", encoding="utf-8", newline="") as source:
            original = source.read()
        updated = replace_description(original)
        if updated != original:
            with path.open("w", encoding="utf-8", newline="") as target:
                target.write(updated)
    except (OSError, UnicodeError, SkillFormatError) as error:
        print(f"narrow-graphify-skill: {path}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
