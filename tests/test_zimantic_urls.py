import importlib.util
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ZIM_ID = "01234567-89ab-cdef-0123-456789abcdef"
OTHER_ID = "fedcba98-7654-3210-fedc-ba9876543210"
SOURCE_KEY = "zim:library:book-0123456789abcdef"
CONTENT_URL = "/zimantic/content/zim%3Alibrary%3Abook-0123456789abcdef"


class ZimanticUrlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        iiab = types.ModuleType("iiab")
        modules = {"iiab": iiab}
        for name in ("iiab_lib", "iiab_const", "adm_const"):
            module = types.ModuleType("iiab." + name)
            setattr(iiab, name, module)
            modules["iiab." + name] = module
        iiab.adm_const.menu_def_base_url = ""
        iiab.adm_const.cmdsrv_proc_timeout = 55
        path = Path(__file__).resolve().parents[1] / "roles/common/templates/adm_lib.py"
        spec = importlib.util.spec_from_file_location("adm_lib_test", path)
        cls.adm = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", modules):
            spec.loader.exec_module(cls.adm)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.adm.CONST.js_menu_dir = self.directory.name
        self.adm.CONST.zim_version_idx_file = "zim_version_idx.json"
        self.config = Path(self.directory.name) / "config.json"
        self.config.write_text(
            json.dumps(
                {
                    "zimanticEnabled": True,
                    "zimanticUrl": "/zimantic/",
                }
            )
        )
        self.get = patch.object(self.adm.requests, "get").start()
        self.addCleanup(patch.stopall)

    def page(self, sources, more=False, snapshot="one"):
        return Mock(
            json=Mock(return_value=sources),
            headers={
                "X-Has-More": "true" if more else "false",
                "X-Snapshot-Version": snapshot,
            },
        )

    def source(self, zim_id=ZIM_ID, key=SOURCE_KEY):
        return {"provider": "zim", "provider_id": zim_id, "key": key}

    def test_pages_are_matched_by_uuid_not_source_slug(self):
        other_key = "zim:other:book-fedcba9876543210"
        self.get.side_effect = [
            self.page([self.source(OTHER_ID, other_key)], more=True),
            self.page([self.source(ZIM_ID.upper())]),
        ]
        urls = self.adm.get_zimantic_urls()
        self.assertEqual(urls[ZIM_ID], CONTENT_URL)
        self.assertEqual(
            urls[OTHER_ID], "/zimantic/content/zim%3Aother%3Abook-fedcba9876543210"
        )
        self.assertEqual(
            self.get.call_args_list[0].args[0], "http://127.0.0.1/zimantic/library.json"
        )
        self.assertEqual(self.get.call_args_list[1].kwargs["params"]["offset"], 1)

    def test_custom_url_and_ambiguous_uuid(self):
        self.config.write_text(
            json.dumps(
                {
                    "zimanticEnabled": True,
                    "zimanticUrl": "http://example.test/books/",
                }
            )
        )
        self.get.return_value = self.page([self.source()])
        self.assertEqual(
            self.adm.get_zimantic_urls()[ZIM_ID],
            "http://example.test/books/content/zim%3Alibrary%3Abook-0123456789abcdef",
        )
        self.get.return_value = self.page(
            [
                self.source(),
                self.source(key="zim:duplicate:book-fedcba9876543210"),
            ]
        )
        self.assertIsNone(self.adm.get_zimantic_urls()[ZIM_ID])

    def test_disabled_or_missing_config_does_not_request_library(self):
        self.config.write_text('{"zimanticEnabled": false}')
        self.assertEqual(self.adm.get_zimantic_urls(), {})
        self.config.unlink()
        self.assertEqual(self.adm.get_zimantic_urls(), {})
        self.get.assert_not_called()

    def test_library_failure_discards_partial_mapping(self):
        self.get.side_effect = [
            self.page([self.source()], more=True),
            self.adm.requests.Timeout("unavailable"),
        ]
        self.assertEqual(self.adm.get_zimantic_urls(), {})

    def test_changed_snapshot_discards_partial_mapping(self):
        self.get.side_effect = [
            self.page([self.source()], more=True),
            self.page([self.source(OTHER_ID)], snapshot="two"),
        ]
        self.assertEqual(self.adm.get_zimantic_urls(), {})

    def test_index_persists_exact_urls_and_removes_stale_urls(self):
        self.adm.iiab.read_library_xml = Mock(
            return_value=(
                {ZIM_ID: {}, OTHER_ID: {}},
                {"content/book.zim": ZIM_ID, "content/other.zim": OTHER_ID},
            )
        )
        self.adm.iiab.human_readable = str
        versions = {
            "book": {"file_name": "book"},
            "other": {"file_name": "other", "zimantic_url": "/stale"},
        }
        self.get.return_value = self.page([self.source()])
        with patch.object(
            self.adm,
            "get_substitution_data",
            return_value=("1", "2", "3", "", "en", "2026-11"),
        ):
            self.adm.write_zim_versions_idx(
                versions, "library.xml", self.directory.name + "/", {}
            )
        saved = json.loads(
            (Path(self.directory.name) / "zim_version_idx.json").read_text()
        )
        self.assertEqual(saved["book"]["zimantic_url"], CONTENT_URL)
        self.assertNotIn("zimantic_url", saved["other"])
        self.assertEqual(saved["other"]["file_name"], "other")


if __name__ == "__main__":
    unittest.main()
