$(document).ready(function () {

    const TABLE_DATA_REFRESH = 15000;
    const DEFAULT_RECIPIENT_ID = 0;
    const INDEX_COLUMN_ENDPOINT_TYPE = 2;

    const makeFormData = (formSelector) => {

        const $inputsTemplate = $(`${formSelector} .recipient-template-container [name]`);

        const params = {
            recipient_name: $(`${formSelector} [name='recipient_name']`).val(),
            endpoint_conf_name: $(`${formSelector} [name='endpoint']`).val(),
            //user_script_categories: $(`${formSelector} [name='user_script_categories']`).val().join(",")
        };

        // load each recipient params inside the template container in params
        $inputsTemplate.each(function (i, input) {
            params[$(this).attr('name')] = $(this).val().trim();
        });

        return params;
    }

    const testRecipient = async (data, $button, $feedbackLabel) => {

        const body = { action: 'test', csrf: pageCsrf };
        $.extend(body, data);

        $button.find('span.spinner-border').fadeIn();
        $feedbackLabel.removeClass(`text-danger text-success`).text(`${i18n.testing_recipient}...`).show();

        try {

            const request = await NtopUtils.fetchWithTimeout(`${http_prefix}/lua/edit_notification_recipient.lua`, {
                method: 'post',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json'
                }
            }, 5000);
            const { result } = await request.json();

            if (result.status == "failed") {
                $button.find('span.spinner-border').fadeOut(function () {
                    $feedbackLabel.addClass(`text-danger`).html(result.error.message);
                });
                return;
            }

            // show a green label to alert the endpoint message
            $button.find('span.spinner-border').fadeOut(function () {
                $feedbackLabel.addClass('text-success').html(i18n.working_recipient).fadeOut(3000);
            });

        }
        catch (err) {

            $button.find('span.spinner-border').fadeOut(function () {

                $feedbackLabel.addClass(`text-danger`);

                if (err.message == "Response timed out") {
                    $feedbackLabel.html(i18n.timed_out);
                    return;
                }

                $feedbackLabel.html(i18n.server_error);

            });
        }

    }

    const createTemplateOnSelect = (formSelector) => {

        const $templateContainer = $(`${formSelector} .recipient-template-container`);
        // on Endpoint Selection load the right template to fill
        $(`${formSelector} select[name='endpoint']`).change(function (e) {
            const $option = $(this).find(`option[value='${$(this).val()}']`);
            const $cloned = cloneTemplate($option.data('endpointKey'));
            // show the template inside the modal container
            $templateContainer.hide().empty();
            if ($cloned) {
                $templateContainer.append($cloned).fadeIn();
            }
            $(`${formSelector} span.test-feedback`).fadeOut();
        });
    }

    function cloneTemplate(type) {

        const template = $(`template#${type}-template`).html();
        // if the template is not empty then return a copy of the template content
        if (template.trim() != "") return $(template);

        return (null);
    }

    let dtConfig = DataTableUtils.getStdDatatableConfig([
        {
            text: '<i class="fas fa-plus"></i>',
            className: 'btn-link',
            enabled: CAN_CREATE_RECIPIENT,
            action: function (e, dt, node, config) {
                $('#add-recipient-modal').modal('show');
            }
        }
    ]);
    dtConfig = DataTableUtils.setAjaxConfig(dtConfig, `${http_prefix}/lua/get_recipients_endpoint.lua`);
    dtConfig = DataTableUtils.extendConfig(dtConfig, {
        columns: [
            {
                data: 'recipient_name'
            },
            {
                data: 'endpoint_conf_name'
            },
            {
                data: `endpoint_key`,
                render: (endpointType) => i18n.endpoint_types[endpointType] || ""
            },
            {
                data: "stats.last_use",
                className: "text-center",
                width: "15%",
                render: $.fn.dataTableExt.absoluteFormatSecondsToHHMMSS
            },
            {
                targets: -1,
                className: 'text-center',
                data: null,
                render: function (_, type, recipient) {

                    if (!recipient.endpoint_conf) return;

                    const isBuiltin = recipient.endpoint_conf.builtin || false;

                    return (`
                        <div class='btn-group btn-group-sm'>
                            <a data-toggle='modal' href='#edit-recipient-modal' class="btn btn-info ${isBuiltin ? 'disabled' : ''}" >
                                <i class='fas fa-edit'></i>
                            </a>
                            <a data-toggle='modal' href='#remove-recipient-modal' class="btn btn-danger ${isBuiltin ? 'disabled' : ''}">
                                <i class='fas fa-trash'></i>
                            </a>
                        </div>
                    `);
                }
            }
        ],
        hasFilters: true,
        stateSave: true,
        initComplete: function (settings, json) {

            const tableAPI = settings.oInstance.api();

            // add a filter to sort the datatable by endpoint type
            DataTableUtils.addFilterDropdown(
                i18n.endpoint_type, endpointTypeFilters, INDEX_COLUMN_ENDPOINT_TYPE, '#recipient-list_filter', tableAPI
            );

            // reload data each TABLE_DATA_REFRESH milliseconds
            setInterval(() => { tableAPI.ajax.reload();  }, TABLE_DATA_REFRESH);
        }
    });

    const $recipientsTable = $(`table#recipient-list`).DataTable(dtConfig);

    /* bind add endpoint event */
    $(`#add-recipient-modal form`).modalHandler({
        method: 'post',
        endpoint: `${http_prefix}/lua/edit_notification_recipient.lua`,
        csrf: pageCsrf,
        resetAfterSubmit: false,
        beforeSumbit: () => {

            $(`#add-recipient-modal form button[type='submit']`).click(function () {
                $(`#add-recipient-modal form span.invalid-feedback`).hide();
            });

            $(`#add-recipient-modal .test-feedback`).hide();

            const data = makeFormData(`#add-recipient-modal form`);
            data.action = 'add';

            return data;
        },
        onModalInit: () => { createTemplateOnSelect(`#add-recipient-modal`); },
        onModalShow: () => {
            // load the template of the selected endpoint
            const $cloned = cloneTemplate($(`#add-recipient-modal select[name='endpoint'] option:selected`).data('endpointKey'));
            if ($cloned) {
                $(`#add-recipient-modal form .recipient-template-container`).empty().append($cloned).show();
            }
        },
        onSubmitSuccess: function (response) {

            if (response.result.status == "OK") {
                $(`#add-recipient-modal`).modal('hide');
                $(`#add-recipient-modal form .recipient-template-container`).hide();
                NtopUtils.cleanForm(`#add-recipient-modal form`);
                $recipientsTable.ajax.reload(function () {
                    DataTableUtils.updateFilters(i18n.endpoint_type, $recipientsTable);
                });
                return;
            }

            if (response.result.error) {
                const localizedString = i18n[response.result.error.type];
                $(`#add-recipient-modal form span.invalid-feedback`).text(localizedString).show();
            }
        }
    }).invokeModalInit();

    const $editRecipientModal = $('#edit-recipient-modal form').modalHandler({
        method: 'post',
        csrf: pageCsrf,
        endpoint: `${http_prefix}/lua/edit_notification_recipient.lua`,
        beforeSumbit: function () {
            const data = makeFormData(`#edit-recipient-modal form`);
            data.action = 'edit';
            data.recipient_id = $(`#edit-recipient-modal form [name='recipient_id']`).val();
            return data;
        },
        onModalInit: function (recipient) {

            $(`#edit-recipient-modal .test-feedback`).hide();

            // if there are no recipients params it means there are no inputs except the recipient's name
            if (recipient.recipient_params.length === undefined) {
                /* load the template from templates inside the page */
                const $cloned = cloneTemplate(recipient.endpoint_key);
                $(`#edit-recipient-modal form .recipient-template-container`)
                    .empty().append($(`<hr>`)).append($cloned).show();
            }
            else {
                $(`#edit-recipient-modal form .recipient-template-container`).empty().hide();
            }

            $(`#edit-recipient-name`).text(recipient.recipient_name);
            /* load the values inside the template */
            $(`#edit-recipient-modal form [name='recipient_id']`).val(recipient.recipient_id || DEFAULT_RECIPIENT_ID);
            $(`#edit-recipient-modal form [name='recipient_name']`).val(recipient.recipient_name);
            $(`#edit-recipient-modal form [name='endpoint_conf_name']`).val(recipient.endpoint_conf_name);
            //$(`#edit-recipient-modal form [name='user_script_categories']`).val(recipient.user_script_categories.split(","));
            $(`#edit-recipient-modal form .recipient-template-container [name]`).each(function (i, input) {
                $(this).val(recipient.recipient_params[$(this).attr('name')]);
            });
            /* bind testing button */
            $(`#edit-test-recipient`).off('click').click(async function (e) {
                e.preventDefault();
                const $self = $(this);
                $self.attr("disabled");
                const data = makeFormData(`#edit-recipient-modal form`);
                data.endpoint_conf_name = recipient.endpoint_conf_name;
                testRecipient(data, $(this), $(`#edit-recipient-modal .test-feedback`)).then(() => {
                    $self.removeAttr("disabled");
                });
            });
        },
        onModalShow: function () {
            $(`#edit-recipient-modal .test-feedback`).hide();
        },
        onSubmitSuccess: function (response) {
            if (response.result.status == "OK") {
                $(`#edit-recipient-modal`).modal('hide');
                $recipientsTable.ajax.reload();
            }
        }
    });

    const $removeRecipientModal = $(`#remove-recipient-modal form`).modalHandler({
        method: 'post',
        csrf: pageCsrf,
        endpoint: `${http_prefix}/lua/edit_notification_recipient.lua`,
        dontDisableSubmit: true,
        onModalInit: (recipient) => {
            $(`.removed-recipient-name`).text(`${recipient.recipient_name}`);
        },
        beforeSumbit: (recipient) => {
            return {
                action: 'remove',
                recipient_id: recipient.recipient_id || DEFAULT_RECIPIENT_ID
            }
        },
        onSubmitSuccess: (response) => {
            if (response.result) {
                $(`#remove-recipient-modal`).modal('hide');
                $recipientsTable.ajax.reload(function () {
                    DataTableUtils.updateFilters(i18n.endpoint_type, $recipientsTable);
                });
            }
        }
    });

    /* bind edit recipient event */
    $(`table#recipient-list`).on('click', `a[href='#edit-recipient-modal']`, function (e) {

        const selectedRecipient = $recipientsTable.row($(this).parent().parent()).data();
        // prevent editing builtin
        if (selectedRecipient.endpoint_conf.builtin) {
            e.preventDefault();
            return;
        }

        $editRecipientModal.invokeModalInit(selectedRecipient);
    });

    /* bind remove endpoint event */
    $(`table#recipient-list`).on('click', `a[href='#remove-recipient-modal']`, function (e) {

        const selectedRecipient = $recipientsTable.row($(this).parent().parent()).data();
        // prevent removing builtin
        if (selectedRecipient.endpoint_conf.builtin) {
            e.preventDefault();
            return;
        }

        $removeRecipientModal.invokeModalInit(selectedRecipient);
    });

    $(`#add-test-recipient`).click(async function (e) {

        e.preventDefault();

        const $self = $(this);

        testRecipient(makeFormData(`#add-recipient-modal form`), $(this), $(`#add-recipient-modal .test-feedback`))
            .then(() => { $self.removeAttr("disabled"); });
    });

    $(`#btn-factory-reset`).click(async function(event) {

        try {

            const response = await NtopUtils.fetchWithTimeout(`${http_prefix}/lua/rest/v1/delete/recipients.lua`);
            const result = await response.json();
            if (result.rc == 0) {
                $recipientsTable.ajax.reload();
                $(`#factory-reset-modal`).modal('hide');
            }

        }
        catch (error) {

            if (err.message == "Response timed out") {
                $(`#factory-reset-modal .invalid-feedback`).html(i18n.timed_out);
                return;
            }
        }
    });

});