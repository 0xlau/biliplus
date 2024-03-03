$(function () {

    $("input[type=checkbox]").each(function(){

        let key = $(this).data("key");
        chrome.storage.sync.get(key, (storage) => {
            $(this).attr("checked", storage[key]);
        })

        $(this).change(() => {
            const key = $(this).data("key");
            let checked = $(this).is(":checked");
            const data = {};
            data[key] = checked;
            chrome.storage.sync.set(data, () => {
                console.log("配置保存成功！");
            })
        });
    });

    chrome.storage.sync.get("hide-user-comment", (storage) => {

        const hideUsers = storage["hide-user-comment"];
        if (hideUsers != null && hideUsers.length > 0){
            $("#hide-user-comment-count").html(hideUsers.length);
            $("#hide-user-comment-count").removeClass("hidden");
        }
    })
});