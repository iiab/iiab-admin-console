# iiab-admin
GUI (Admin Console) to configure iiab and install content

Notes:

Catalogs with metadata

available zims       - kiwix library.xml kiwixCatalog
installed zims       - local library.xml installedZimCatalog.INSTALLED
zims on usb          - externalDeviceContents[usb].zim_modules
zims on selected usb - externalZimCatalog = copy of zims from externalDeviceContents[selected usb].zim_modules

download scheduled zims - cmdsrv zims_downloading installedZimCatalog.DOWNLOADING
copy scheduled zims - cmdsrv zims_copying installedZimCatalog.COPYING

zims on usb    - usb library.xml   externalZimCatalog = copy of zims from externalDeviceContents[selected usb].zim_modules
oer2go modules available - download from oer2go oer2goCatalog
oer2go modules installed - same (assumes items remain in catalog)
oer2go modules on usb    - same (also assumes iiab's catalog is up to date [might not be true])
externalDeviceContents[dev].zim_modules
externalDeviceContents[dev].oer2go_modules [what about modules subdirectories not in catalog, i.e. just copied there by someone?]

Lists which index into catalogs

zimsInstalled
zimsDownloading
zimsCopying
oer2goInstalled
oer2goDownloading
oer2goCopying
manContSelections.internal.zims
manContSelections.internal.modules
manContSelections[dev].sum
manContSelections[dev].zims
manContSelections[dev].modules
