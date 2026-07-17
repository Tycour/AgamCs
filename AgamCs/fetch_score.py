# fetch_score.py

from pathlib import Path
import h5py
import pandas as pd


DATASET_FILENAME = 'AgamP4_conservation.h5'


def get_dataset_path():
    """Return the HDF5 dataset path, preferring the current project data dir."""
    project_data_path = Path(__file__).resolve().parents[1] / 'data' / DATASET_FILENAME
    cwd_data_path = Path.cwd() / 'data' / DATASET_FILENAME

    if project_data_path.exists():
        return project_data_path
    if cwd_data_path.exists():
        return cwd_data_path

    checked_paths = f'{project_data_path} or {cwd_data_path}'
    raise FileNotFoundError(
        f'Dataset file does not exist. Download {DATASET_FILENAME} from the README link '
        f'and place it at {project_data_path}. Checked: {checked_paths}'
    )


def fetch_scores(region, arrays, output_file):
    """
    Fetches conservation scores from the HDF5 file based on the specified region and arrays,
    and saves the results to a specified output file.

    Args:
        region (str): Genomic region in the format 'chromosome:start-end' (e.g., '3R:5886340-5889928').
        arrays (str): Comma-separated list of arrays to access (e.g., 'Cs,score,snp_density,stack,stack_norm,phyloP').
        output_file (str): Name of the output file where data will be saved (e.g., 'results.tsv').

    Raises:
        FileNotFoundError: If the HDF5 dataset file does not exist.
    """

    def parse_region(region_string):
        """
        Parses the region string to extract chromosome, start, and end positions.

        Args:
            region_string (str): Region string in the format 'chromosome:start-end'.

        Returns:
            tuple: A tuple containing the chromosome (str), start (int), and end (int) positions.
        """
        chromosome, positions = region_string.split(':')
        start, end = positions.split('-')
        return chromosome, int(start), int(end)

    file_name = get_dataset_path()

    # Parse the region string to get chromosome, start, and end positions
    chromosome, start, end = parse_region(region)
    # Split the arrays string into a list of arrays
    arrays = arrays.split(',')

    # Open the HDF5 file
    with h5py.File(file_name, mode='r') as root:
        combined_df = pd.DataFrame()

        for array in arrays:
            # Extract the values for the specified region and array
            values = root[chromosome][array][:, start - 1:end]
            # Extract the row names (attributes of the array)
            row_names = root[chromosome][array].attrs['rows']

            if values.shape[0] == 1:
                # If there is only one row, create a DataFrame with a single column
                df = pd.DataFrame(values.T, columns=[f"{array}_{row_names[0]}"])
            else:
                # If there are multiple rows, create a DataFrame with multiple columns
                df = pd.DataFrame(values.T, columns=[f"{array}_{name}" for name in row_names])

            if combined_df.empty:
                # If the combined DataFrame is empty, initialize it with the current DataFrame
                combined_df = df
            else:
                # Otherwise, concatenate the current DataFrame to the combined DataFrame
                combined_df = pd.concat([combined_df, df], axis=1)

        # Add the chromosome and position columns to the combined DataFrame
        combined_df['chromosome'] = chromosome
        combined_df['pos'] = pd.Series(range(start, end + 1))

        # Reorder the columns to place 'chromosome' and 'pos' at the beginning
        cols = combined_df.columns.tolist()
        combined_df = combined_df.loc[:, cols[-2:] + cols[:-2]]

        # Save the combined DataFrame to the output file in TSV format
        combined_df.to_csv(output_file, sep='\t', index=False)
        print(f'Saved to {output_file}')
