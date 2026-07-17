# setup.py

from setuptools import setup, find_packages

setup(
    name='AgamCs',
    version='0.1',
    packages=find_packages(),
    include_package_data=True,
    package_data={'AgamCs': ['data/*.json']},
    install_requires=[
        'pandas',
        'seaborn',
        'matplotlib',
        'h5py',
        'fsspec>=2025.2.0',
        'aiohttp>=3.10',
        'requests>=2.32',
        'zarr>=3.0.1,<4',
    ],
    extras_require={
        'build': ['kerchunk>=0.2.10'],
        'web': ['shiny>=1.6'],
        'test': ['pytest'],
    },
    entry_points={
        'console_scripts': [
            'AgamCs=AgamCs.main:main',
        ],
    },
)
