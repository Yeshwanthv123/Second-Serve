"""Build a reviewable source archive; include only explicit application paths."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = ['backend/app', 'backend/tests', 'frontend/src', 'frontend/tests', 'frontend/public', 'docs', '.github', 'scripts']
FILES = ['README.md', 'START-HERE.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore', '.env.example', 'compose.yaml', 'docker.yaml',
         'backend/Dockerfile', 'backend/.dockerignore', 'backend/requirements.in', 'backend/requirements.txt', 'backend/pytest.ini',
         'frontend/Dockerfile', 'frontend/.dockerignore', 'frontend/nginx.conf', 'frontend/index.html',
         'frontend/package.json', 'frontend/package-lock.json', 'frontend/tsconfig.json',
         'frontend/vite.config.ts', 'frontend/vitest.config.ts']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--complete', action='store_true', help='Include full fictional live-LLM verification evidence')
    args = parser.parse_args()
    output = ROOT / 'artifacts' / ('second-serve-complete.zip' if args.complete else 'second-serve-source.zip')
    output.parent.mkdir(exist_ok=True)
    paths = [ROOT / p for p in FILES]
    if args.complete:
        paths.append(ROOT / 'artifacts/live-llm-verification.json')
    for directory in DIRECTORIES:
        paths.extend(p for p in (ROOT / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc')
    manifest = {}
    with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
        for path in sorted(set(paths)):
            relative = path.relative_to(ROOT).as_posix()
            if path.name == '.env' or path.suffix in {'.db', '.sqlite', '.sqlite3', '.pyc'}:
                raise ValueError(f'Private/runtime file must not be packaged: {relative}')
            data = path.read_bytes()
            manifest[relative] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            archive.writestr('second-serve/' + relative, data)
        archive.writestr('second-serve/PACKAGE-MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
    with ZipFile(output) as archive:
        assert archive.testzip() is None
        assert not any(name.endswith(('.db', '/.env', '.pyc')) or '/node_modules/' in name for name in archive.namelist())
        for relative, entry in manifest.items():
            data = archive.read('second-serve/' + relative)
            assert len(data) == entry['bytes']
            assert hashlib.sha256(data).hexdigest() == entry['sha256']
        print(f'{output} — {len(archive.namelist())} files, {output.stat().st_size:,} bytes; archive integrity verified')


if __name__ == '__main__':
    main()

