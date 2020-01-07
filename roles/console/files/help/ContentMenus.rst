IIAB Admin Console - Content Menus
==================================

The options on this menu allow you to create and edit menus for the user to navigate Internet-in-a-Box Content. In most cases this will be the home page of the server.

The links on the home page menu will be automatically added for services selected when Internet-in-a-Box is installed. Links will also be added when content is added from Kiwix or from OER2Go.

Edit Content Menus
------------------

## Overview

The Internet-in-a-Box home page has a menu with links to all the installed content. This menu is dynamically generated from a file, menu.json, that contains general parameters and a list of actual links to display.

The links use another set of files, referred to as Menu Item Definitions, which hold things like the logo file name, title, description, etc.

There are two somewhat different layouts depending on whether the user connects with a mobile or desktop device.

### Do this First

When you first access this option a list of all existing Menu Item Definitions will be loaded in the background. You need to select a menu to edit and click the **Load Menu** button.

For most users the location of that menu will be 'home', the default in the Menu Folder field. It is recommended to open another tab in your browser to the menu you intend to edit so that you can see the results simply by refreshing that tab.

Note that if you want to edit a menu other than home the directory must already exist and will not be created.

### How it works

After you have 'loaded' a menu, make changes using the tabs described below. Then click **Save Menu** to save your changes. You can refresh your browser tab to view the menu page with your changes.

Make changes with the following tabs:

### Menu Properties

Click this tab to edit the general properties of the menu.

The following may be set separately for the **Mobile Layout** or the **Desktop Layout**:

**Header Font** - There is a drop down that shows several available fonts. One is a standard modern font and the others may appeal more to younger users.

**Show Description** - By unchecking this field you can cause the description not to be shown in the menu links.

**Show Extra Description** - By unchecking this field you can cause the extra description not to be shown in the menu links.

**Show Sub-menu** - By unchecking this field you can cause the full sub-menu not to be shown in the menu links.

**Show Footnote** - By unchecking this field you can cause the footnote not to be shown in the menu links.

The following apply to both layouts:

**Default Language** - This will be used to select a menu item definition when there are definitions in more than one language.

**Check to Have the Menu Automatically Updated** - Services installed as well as ZIM files and OER2Go modules can be automatically added to the menu. **Be Careful** as some manual changes may be reverted by this option.

**Check to Allow Kiwix Cross Zim Search** - The Kiwix server supports search across all zims and just a particular zim. If you check this field an icon will be included on the menu to access search across all installed zims. **Please Note** that this search becomes slower the more zims you have installed.

**Check to Allow Power Off Link** - If this is checked a link to power off the server will be included at the bottom of the home page. You must also have enable this when you installed Internet-in-a-Box.

**Prompt on Power Off Link** - For an English menu this is probably Power Off, but use this field to change the prompt, especially for other languages.

### Current Item List

Click this tab to change the Menu Items included in the menu. You will see two lists of links.

On the **left** are the links in the menu you are editing and on the **right** are all of the available **Menu Item Definitions**.

* To change the order of links drag a link up or down the list on the left.
* To add a link drag it from the right to the left.
* To remove a link drag it from the left to the right.

### Don't Forget

Don't forget to save your changes by clicking **Save Menu**. The **menu item list is not part of the menu until you save**.

Edit Menu Items
---------------

###Select Menu Item

Before editing you must select a Menu Item Definition. If you click **Edit** changes will be applied to that Menu Item. If you click **Clone** a copy will be made that allows you to create another version, say in another language, or another definition that is similar, say for a similar zim.

Edit will be the most common thing to do.

###Edit Menu Item


You can edit the Title and other parts of the Menu Items that are on the current menu. Here are the fields and their use:

* Title - Put a short, one line name for the item here. Ideally it would be unique and way shorter than this text.
* Name of Icon File - This is an image file in /library/www/html/js-menu/menu-files/images. At present we don't validate it. There are **buttons** to select an image file and to upload a new one.
* Description - Put a fuller description of the item here, but not more than one paragraph.
* Start URL (Optional) - Only change this if the the blank default doesn't work.
* Extra_description - If there is more description, put it here.
* Sub Menu Html File (Optional) - This is an html file in /library/www/html/js-menu/menu-files/menu-defs. At present we don't validate it.
* Footnote - You can put catalog type information here like number of pdfs or size. Also you can use the ##SIZE## and other substitution fields for zims.
* Upload My Changes to the Central Repository - If this is checked edits to this Menu Item Definition will replace that of the central repository.
* Download Updates of Others from the Central Repository - If this is checked any new version of this Menu Item Definition will be downloaded and replace the one on this server.

If you selected **Clone** you will be able to edit the following fields as well:

* Select Menu Item Type - The type of Menu Item Definition determines how it displays and the link to which it points. Select from the list.
* Select Menu Item Language - The language is part of the Menu Item Definition name. Select from the list.
* Content this Menu Item Shows - What you put here will depend on the Type. It could be a directory under modules or in the webroot, or the name of a zim (without the date part).
* Menu Item Code - This is calculated based on the above fields and may not be changed.
* Optional Code Suffix - This is an option suffix that will be added to the Menu Item Definition to distinguish it from another definition, perhaps a country code.

Actions
-------

**Refresh Lists** reloads the lists of menu definitions in case a new one was generated by a download of content.

**Sync Menu Defs** synchronizes changes to this Menu Item Definition with the central repository (https://github.com/iiab-share/js-menu-files).

### Sync Menu Defs Rules

The following rules are applied when synchronizing Menu Item Definitions between the local server and the central repository.

First the givens:

* A definition has an Edit Status and a Commit SHA Code.
* Edit Status is computed and set to one of "repo", "generated", or "local_change".
* After installation all should be "repo".
* If you download content such Kiwix ZIMs or OER2Go content or map packs a definition is generated and marked "generated".
* Any definition that has been edited will be marked "local_change".
* Commit SHA Code comes from the central repository. A generated defintion will not have one.
* An upload flag and a download flag may exist and be true or false. upload defaults to false, but true for local_change, and download defaults to true, but false for local_change. They can also be set when a definition is edited.

Now when **Sync Menu Defs** is clicked:

* Definitions that are in the exclusion list of obsolete definitions are skipped.
* Definitions whose names do not begin with a legal language code are skipped.
* Any defintion that is in the central repository and not on the local server will be downloaded.
* If a definition is on the local server and not in the central repository it will be uploaded if the upload flag is true.
* If a definition is in both the central repository and on the local server then:
* If the Edit Status is "repo" and the Commit SHA Codes are the same there is nothing to do.
* If the Edit Status is "repo" and the Commit SHA Codes are different it is downloaded if the download flag is true (should always be the case).
* If the Edit Status is "local_change" and the Commit SHA Codes are the same it is uploaded if the upload flag is true.
* If the Edit Status is "local_change" and the Commit SHA Codes are different then it has been modified by two different users and we can not merge it at this time.
* If the Edit Status is "generated" it is skipped.
