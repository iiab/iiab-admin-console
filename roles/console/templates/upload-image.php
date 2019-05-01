<?php
/*
*  upload-image.php
*  menu def icon for admin console
*/

$dest = '/library/www/html/js-menu/menu-files/images/';
$path = $dest . $_FILES['file']['name'];
move_uploaded_file($_FILES['file']['tmp_name'], $path);

?>

