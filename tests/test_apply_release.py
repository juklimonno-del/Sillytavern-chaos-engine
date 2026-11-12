import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'apply_release.py'
spec = importlib.util.spec_from_file_location('apply_release', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ApplyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / 'package'; self.source.mkdir()
        self.target = self.root / 'installed'; self.target.mkdir()
        self.old = {'index.js': b'old index\n', 'manifest.json': b'{"version":"1.7.0"}\n', 'tests/legacy.cjs': b'old tests\n'}
        self.new = {'index.js': b'new index\n', 'manifest.json': b'{"version":"1.7.1"}\n', 'entry.js': b'new entry\n'}
        for rel, data in self.old.items():
            p = self.target / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)
        for rel, data in self.new.items():
            (self.source / rel).write_bytes(data)
        self.meta = {'baseline_blobs': {r:m.git_blob(d) for r,d in self.old.items()}, 'payload_sha256': {r:m.sha256(d) for r,d in self.new.items()}, 'retire_tests':['tests/legacy.cjs']}
    def test_dry_plan_changes_nothing(self):
        p=m.make_plan(self.source,self.target,self.meta); self.assertEqual(len(p),4)
        self.assertEqual((self.target/'index.js').read_bytes(),self.old['index.js'])
    def test_apply_backup_and_restore(self):
        backup=m.apply_plan(self.target,m.make_plan(self.source,self.target,self.meta))
        self.assertEqual((self.target/'index.js').read_bytes(),self.new['index.js'])
        self.assertFalse((self.target/'tests/legacy.cjs').exists())
        m.restore(self.target,backup,True)
        for rel,data in self.old.items(): self.assertEqual((self.target/rel).read_bytes(),data)
        self.assertFalse((self.target/'entry.js').exists())
    def test_modified_source_is_rejected(self):
        (self.source/'index.js').write_bytes(b'tampered')
        with self.assertRaises(ValueError):m.make_plan(self.source,self.target,self.meta)
    def test_modified_destination_is_rejected(self):
        (self.target/'index.js').write_bytes(b'user changes')
        with self.assertRaises(ValueError):m.make_plan(self.source,self.target,self.meta)
    def test_modified_retired_test_is_preserved(self):
        (self.target/'tests/legacy.cjs').write_bytes(b'my tests')
        with self.assertRaises(ValueError):m.make_plan(self.source,self.target,self.meta)
        self.assertEqual((self.target/'tests/legacy.cjs').read_bytes(),b'my tests')
    def test_path_traversal_rejected(self):
        with self.assertRaises(ValueError):m.safe_path(self.target,'../elsewhere')
    def test_symlink_rejected(self):
        (self.target/'entry.js').symlink_to(self.source/'entry.js')
        with self.assertRaises(ValueError):m.make_plan(self.source,self.target,self.meta)
    def test_newline_normalized_old_checkout_is_valid(self):
        (self.target/'index.js').write_bytes(self.old['index.js'].replace(b'\n',b'\r\n'))
        self.assertIn('index.js',m.make_plan(self.source,self.target,self.meta))
    def test_reapplying_is_idempotent(self):
        m.apply_plan(self.target,m.make_plan(self.source,self.target,self.meta))
        self.assertEqual(m.make_plan(self.source,self.target,self.meta),{})
    def test_restore_refuses_new_changes(self):
        backup=m.apply_plan(self.target,m.make_plan(self.source,self.target,self.meta))
        (self.target/'index.js').write_bytes(b'newer work')
        with self.assertRaises(ValueError):m.restore(self.target,backup,True)
    def test_failure_rolls_back_already_changed_files(self):
        real=m.atomic_write
        def failing(path,data):
            if path.name=='manifest.json' and data==self.new['manifest.json']:raise OSError('simulated failure')
            real(path,data)
        with patch.object(m,'atomic_write',failing):
            with self.assertRaises(OSError):m.apply_plan(self.target,m.make_plan(self.source,self.target,self.meta))
        for rel,data in self.old.items():self.assertEqual((self.target/rel).read_bytes(),data)
    def test_existing_file_permissions_are_preserved(self):
        (self.target/'index.js').chmod(0o640)
        m.apply_plan(self.target,m.make_plan(self.source,self.target,self.meta))
        self.assertEqual((self.target/'index.js').stat().st_mode & 0o777,0o640)
        self.assertEqual((self.target/'entry.js').stat().st_mode & 0o777,0o644)
    def test_package_metadata_is_copied_without_self_hash_recursion(self):
        self.meta['self_manifest']='release-files.json'
        (self.source/'release-files.json').write_bytes(b'{}')
        m.apply_plan(self.target,m.make_plan(self.source,self.target,self.meta))
        self.assertEqual((self.target/'release-files.json').read_bytes(),b'{}')
        self.assertEqual(m.make_plan(self.source,self.target,self.meta),{})
    def test_source_and_destination_cannot_be_same(self):
        with self.assertRaises(ValueError):m.make_plan(self.target,self.target,self.meta)

if __name__=='__main__':unittest.main()
