<!DOCTYPE html>
<html lang="en">
  <head>
    <title>IIAB Menu Item Icon Uploader</title>
  </head>
  <body>
    <?php
      //var_dump($_FILES);
      //echo "<BR>";
     ?>
    <h2>Select Menu Item Icon Files to upload</h2>
    <form name="icon_uploader" method="post" enctype="multipart/form-data" action="<?php echo htmlentities($_SERVER['PHP_SELF']); ?>">
        <input type="file" name="fileToUpload"><br><br>
        <input type="submit" value="Upload Image" name="submit">
    </form>
    <?php
      if (!empty($_FILES['fileToUpload']['name']) && !empty($_FILES['fileToUpload']['tmp_name'])) {
        $image_types_parts = explode("/", $_FILES['fileToUpload']['type']);
        if ($image_types_parts[0] != 'image') {
          echo "<BR><strong>Only images may be uploaded.</strong><BR>";
        } else {
          $upload_image = $_FILES['fileToUpload']['name'];
          $move_src = $_FILES['fileToUpload']['tmp_name'];
          $dest = '/library/www/html/js-menu/menu-files/images/' . $upload_image;
          $rc = move_uploaded_file($move_src, $dest);
          echo $rc . "<BR>";
          if ($rc){
            echo "<BR><strong>" . $upload_image . " uploaded.</strong><BR>";
          } else {
            echo "<BR><strong>" . $upload_image . " failed to upload.</strong><BR>";
          }
          $_FILES['fileToUpload']['name'] = "";
        }
      } else {
        echo "<BR><strong>Select a file to upload.</strong><BR>";
      }
     ?>
  </body>
</html>
