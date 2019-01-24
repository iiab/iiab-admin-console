IIAB Admin Console - Content Menus
==================================

The options on this menu allow you to create and edit menus for the user to navigate Internet-in-a-Box Content. In most cases this will be the home page of the server.

The links on the home page menu will be automatically added for services selected when Internet-in-a-Box Content is installed. Links will also be added when content is added from Kiwix or from OER2GO.

Edit Content Menus
------------------

## Overview

The Internet-in-a-Box home page has a menu with links to all the installed content. This menu is dynamically generated from a file, menu.json, that contains general parameters and a list of actual links to display.

The links use another set of files, referred to as Menu Item Definitions, which hold things like the logo file name, title, description, etc.

There are two somewhat different layouts depending on whether the user connects with a mobile or desktop device.

### Do this First

When you first access this option a list of all existing Menu Item Definitions will be loaded in the background. You need to select a menu to edit and click the **Load Menu** button.

For most users the location of that menu will be 'home', the default in the Menu Folder field. It is recommended to open another tab in your browser to the menu you intend to edit so that you can see the results simply by refreshing that tab.

### How it works

After you have 'loaded' a menu, make changes using the tabs described below. Then click **Save Menu** to save your changes. You can refresh your browser tab to view the menu page with your changes.

Make changes with the following tabs:

### Menu Properties

Click this tab to edit the general properties of the menu.

The following may be set separately for the **Mobile Layout** or the **Desktop Layout**:

**Header Font** - There is a drop down that shows several available fonts. One is a standard modern font and the others may appeal more to younger users.

**Show Description** - By unchecking this field you can cause the description not to be shown in the menu links.

**Show Sub-menu** - By unchecking this field you can cause the full sub-menu not to be shown in the menu links.

The following apply to both layouts:

**Check to Have the Menu Automatically Updated** - Services installed as well as zims and oer2go modules can be automatically added to the menu. **Be Careful** as some manual changes may be reverted by this option.

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

Don't forget to save your changes by clicking **Save Menu**.

Edit Menu Items - Future
------------------------

Not yet implemented.


Actions
-------

Not yet implemented.