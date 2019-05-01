<?php
/*
*  upload-image.php
*  menu def icon for admin console
*/

$error_reply = '{"Error": "Error uploading image file."}';
$success_reply = '{"Success": "Image Uploaded Successfully."}';
try {
  $dest = '/library/www/html/js-menu/menu-files/images/';
  $path = $dest . $_FILES['file']['name'];
  move_uploaded_file($_FILES['file']['tmp_name'], $path);
  $reply = $success_reply;
} catch (Exception $e) {
  $reply = $error_reply;
}

header('Content-type: application/json');
echo $reply

?>
