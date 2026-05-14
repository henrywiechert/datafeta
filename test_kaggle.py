import kaggle
import inspect
api = kaggle.api
sig = inspect.signature(api.dataset_download_files)
print(sig)
