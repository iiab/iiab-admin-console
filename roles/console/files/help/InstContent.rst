IIAB Admin Console - Install Content
====================================

The options on this menu allow you to download and install content onto Internet-in-a-Box.  This content can come from the internet or be copied from USB or a portable hard disk drive.

These options are aimed at people who plan to set up the server in a location where there is a relatively high bandwidth connection and then deploy it where there is little or no connectivity.

Get ZIM Files from Kiwix
------------------------

### Overview

The words ZIM and Kiwix are probably unfamiliar, but the content is very familiar and highly desirable, including all or some of the following for more than 100 languages:

* Wikipedia
* Wiktionary
* TED Talks
* Project Gutenberg Books
* Wikibooks
* Wikiquote
* Wikinews
* Wikivoyage
* Others

Kiwix.org supplies a server that is installed on Internet-in-a-Box and also hosts all of this content.

### Do this First

Click on the button labelled **Refresh Kiwix Catalog** if you have not done so before or if it has been a month or more since you last did so.  This will retrieve the latest list of content hosted at Kiwix.org.

### How it works

When you Click on this menu option you will see a list of any content already installed, any in the process of being installed, and all content available in the languages selected.

To select more languages Click on the button labelled **Select Languages**.  You will see the six languages with the most speakers in the world.  Click **More Languages** for others.  Check the language you want and then click **Show Content** or the **x** in the top right of the screen.

Next **Check the Titles** you want to download.  You will see the total space available and the amount required for your selections.  Be aware that the download process can require approximately double this amount.

When you have made your selections click **Install Selected ZIMs**.  Jobs will be created on the server to download, unzip, and install the selected content.  These are large files and the download can take a long time.  Visit **Display Job Status** on the **Utilities** menu to see when they have completed or any problems encountered.  It is not necessary to keep the browser open during the download.

### Don't Forget

When each of the ZIM files has been downloaded and installed the Kiwix server will be restarted automatically. This can also be done manuall by clicking **Reindex Kiwix Content**.

Make sure that the **Kiwix** service is enabled under **Configure** - **Services Enabled**.

Get OER2Go(RACHEL) Modules
--------------------------

### Overview

Many people have heard of RACHEL as a source of Educational Content. The RACHEL repository is also known as OER2Go and contains modules accessible with a web server such as:

* CK-12
* English Storybooks
* Hesperian Health Guides
* Practical Action
* And Many Others

### Do this First

When you installed the Admin Console the latest version of the OER2Go catalog was downloaded. When you click this menu option the system will check to see if it is still less than a month old and will recommend downloading again if it is not.

To get the latest version Click on the button labelled **Refresh OER2Go Catalog**.

### How it works

When you Click on this menu option you will see a list of any content already installed, any in the process of being installed, and all content available in the languages selected.

To select more languages Click on the button labelled **Select Languages**.  You will see the six languages with the most speakers in the world.  Click **More Languages** for others.  Check the language you want and then click **Show Content** or the **x** in the top right of the screen.

Next **Check the Titles** you want to download.  You will see the total space available and the amount required for your selections.

When you have made your selections click **Install Selected Modules**.  Jobs will be created on the server to download and install the selected content.  These are large files and the download can take a long time.  Visit **Display Job Status** on the **Utilities** menu to see when they have completed or any problems encountered.  It is not necessary to keep the browser open during the download.

### Don't Forget

Downloaded Modules will appear on the server in a URL like /modules/Name of the Module. If you are using IIAB-Menu, there will already be a menu definition for most modules, but you may need to create your own. You may also need to add a reference to the module to your menu file.

Download Khan Academy Videos
----------------------------

### How it works

KA Lite from the Learning Equality Foundation is installed on Internet-in-a-Box for offline viewing of Khan Academy videos and exercises.  It has its own options to select language and download videos.  To access this functionality simply click **Launch KA Lite** and another tab will open where you can login and manage content.

### Don't Forget

Make sure that the **KA Lite** and **KA Downloader** services are enabled under **Configure** - **Services Enabled**.

Manage Content
--------------

The previous menu options helped you get content from sources on the internet. This option allows you to copy that content to and from USB devices and to remove content no longer wanted.

You can use the copy function to back up content or to install content from the sdcard of another IIAB installation.

Over time you may find that ZIM files or OER2Go/RACHEL modules are no longer needed or in need of upgrade. So you may want to delete some of the ones that are installed.

In addition, when you install ZIM files or OER2Go/RACHEL modules you are downloading large files from the internet.  These are not removed in case there is a problem and the installed needs to be rerun.

After you are sure that everything has been installed successfully you can remove some or all of these files to free up space on the disk.

Here is how to verify that an item has been installed:

* Look at the installation page and ensure that the item is marked as installed.
* Look at the Server menu to see if the item is accessible and brings up content.

To remove a module or file check the corresponding box and click **Remove Selected Content**.

### Do this First

Unless you just want to remove internally installed content, you will want a USB drive.

* Insert the drive or sd card with an adapter into a USB slot.
* Wait for 10 seconds or so for IIAB to mount the drive.
* Click **Find USB Device**
* One or more devices should be listed in the Device table.
* If there is more than one, click the radio button to select the one you want to work with.

### How it works

There are one or two panels below, the left one for internal content and a right one if you have a USB inserted.

Both have a list and ZIM files and a list of OER2Go modules with tags showing what is installed, what is in the processing copying, and what is already on the other device.

To Copy or Remove internal content click on the left panel. To use the USB, click on the right.

Check the box beside the content of interest and click **Copy Installed to ...** to Copy or  **Remove Selected Content** to Remove.

Because copying happens in the background you can watch its status on **Display Job Status** on the **Utilities** menu to see when it has completed or any problems encountered.

You can also click **Refresh Display** to update the tags beside items is various lists.

Before pulling the USB device out please selected it with the device radio button if there is more than one and then clicking **Remove USB from Server**

Clone IIAB Server
-----------------

This menu options allows you to make an identical copy of your running Internet in a Box Server.

Please note the **WARNING** that everything on the target device will be overwritten.

Please also note that everything on the server will be copied including usage statistics and the data for all content applications.

If no USB device is listed click **Find USB Device** to search for attached devices.

Make sure that the device is large enough to hold the entire server. The space required and the size of each device is displayed.

When you are ready click **Clone IIAB**. This can take as much as two hours if there is a lot of content.

Check Utilities -> Job Status to see what percent of the copy is complete and when the copy is finished.


Actions
-------

**Refresh Display** recalculates what is installed and what is in the process of being installed and tags content accordingly.

**Reindex Kiwix Content** in order to display a ZIM file Kiwix needs it to be in the library.xml catalog. Normally this should happen automatically. Click this to force a redindex.

**Refresh Kiwix Catalog** gets the latest catalog of ZIM files from Kiwix. You are warned it the catalog is more than 30 days old.

**Refresh OER2Go Catalog** gets the latest catalog of content modules from OER2Go.  You are warned it the catalog is more than 30 days old.
