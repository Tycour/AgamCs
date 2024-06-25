# setup.py

from setuptools import setup, find_packages

setup(
    name='AgamCs',
    version='0.1',
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        'pandas',
        'seaborn',
        'matplotlib',
        'h5py'
    ],
    entry_points={
        'console_scripts': [
            'AgamCs=AgamCs.main:main',
        ],
    },
)
