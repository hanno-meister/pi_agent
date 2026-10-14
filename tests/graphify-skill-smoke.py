#!/usr/bin/env python3
"""Offline smoke checks for the Graphify skill description override."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "agent_profiles/code/narrow-graphify-skill.py"
ENTRYPOINT = ROOT / "docker-entrypoint.sh"
DESCRIPTION = (
    "Use only for explicit Graphify requests or questions answered from an existing "
    "graphify-out/graph.json. Build, update, query, or export a knowledge graph."
)


class GraphifySkillSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not HELPER.is_file():
            raise RuntimeError(f"skill helper is missing: {HELPER}")

    def make_fixture(self, content: str) -> tuple[Path, tempfile.TemporaryDirectory[str]]:
        temporary = tempfile.TemporaryDirectory(prefix="graphify-skill-smoke-")
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "SKILL.md"
        path.write_text(content, encoding="utf-8", newline="")
        return path, temporary

    def apply_helper(self, path: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(HELPER), str(path)],
            cwd=path.parent,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_single_line_description_metadata_body_and_idempotency(self) -> None:
        original = (
            "---\n"
            "name: graphify\n"
            'description: "Original upstream description."\n'
            "references:\n"
            "  - docs/graphify.md\n"
            "custom: preserve-this\n"
            "---\n"
            "# Graphify body\n"
            "Keep the full body and references unchanged.\n"
            "\n---\n"
        )
        expected = original.replace(
            'description: "Original upstream description."',
            f'description: "{DESCRIPTION}"',
            1,
        )
        path, _ = self.make_fixture(original)

        first = self.apply_helper(path)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(path.read_text(encoding="utf-8"), expected)

        second = self.apply_helper(path)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(path.read_text(encoding="utf-8"), expected)

    def test_multiline_description_preserves_other_metadata_and_body(self) -> None:
        original = (
            "---\n"
            "name: graphify\n"
            "description: >-\n"
            "  Original wrapped description.\n"
            "  More upstream detail.\n"
            "references:\n"
            "  - docs/graphify.md\n"
            "custom: preserve-this\n"
            "---\n"
            "# Full generated body\n"
            "Do not rewrite this section.\n"
        )
        expected = (
            "---\n"
            "name: graphify\n"
            "description: >-\n"
            f"  {DESCRIPTION}\n"
            "references:\n"
            "  - docs/graphify.md\n"
            "custom: preserve-this\n"
            "---\n"
            "# Full generated body\n"
            "Do not rewrite this section.\n"
        )
        path, _ = self.make_fixture(original)

        first = self.apply_helper(path)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(path.read_text(encoding="utf-8"), expected)

        second = self.apply_helper(path)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(path.read_text(encoding="utf-8"), expected)

    def test_crlf_file_preserves_line_endings_and_body_bytes(self) -> None:
        original = (
            "---\r\n"
            "name: graphify\r\n"
            'description: "Original upstream description."\r\n'
            "references: []\r\n"
            "---\r\n"
            "# Body remains byte-for-byte after metadata update.\r\n"
        )
        expected = original.replace(
            'description: "Original upstream description."',
            f'description: "{DESCRIPTION}"',
            1,
        )
        path, _ = self.make_fixture("")
        path.write_bytes(original.encode("utf-8"))

        result = self.apply_helper(path)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(path.read_bytes(), expected.encode("utf-8"))

    def test_malformed_frontmatter_or_description_fails_without_modifying_file(self) -> None:
        cases = [
            ("# no frontmatter\n", "opening frontmatter"),
            ("---\nname: graphify\n---\nbody\n", "description field is missing"),
            (
                '---\nname: graphify\ndescription: unquoted value\n---\nbody\n',
                "invalid description",
            ),
            (
                '---\nname: graphify\ndescription: "one"\ndescription: "two"\n---\n',
                "duplicate description",
            ),
            (
                '---\nname: graphify\ndescription: "unterminated\n',
                "closing frontmatter delimiter",
            ),
            (
                '---\nname: graphify\ndescription: "one"\n---\n---\nbody\n',
                "duplicate frontmatter",
            ),
        ]
        for original, diagnostic in cases:
            with self.subTest(diagnostic=diagnostic):
                path, _ = self.make_fixture(original)
                original_bytes = path.read_bytes()
                result = self.apply_helper(path)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("narrow-graphify-skill:", result.stderr)
                self.assertIn(diagnostic, result.stderr)
                self.assertEqual(path.read_bytes(), original_bytes)

    def test_entrypoint_applies_override_only_after_successful_generation(self) -> None:
        entrypoint = ENTRYPOINT.read_text(encoding="utf-8")
        branch_start = entrypoint.index('if [ -d "$code_skills" ]; then')
        branch_end = entrypoint.index("\nfi\n\n# The repository is mounted", branch_start)
        branch = entrypoint[branch_start:branch_end]
        installer = 'graphify install --project --platform opencode >/dev/null'
        helper = (
            'python3 /pi_agent/agent_profiles/code/narrow-graphify-skill.py '
            '"$code_skills/graphify/SKILL.md"'
        )
        failure_handling = '    rm -rf "$graphify_stage"\n    exit 1\n  fi\n'

        self.assertIn(installer, branch)
        self.assertIn(helper, branch)
        self.assertIn(failure_handling, branch)
        self.assertLess(branch.index(installer), branch.index(failure_handling))
        self.assertLess(
            branch.index(failure_handling) + len(failure_handling), branch.index(helper)
        )
        self.assertLess(branch.index(helper), entrypoint.index("cp /pi_agent/agent_profiles/code/code"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
