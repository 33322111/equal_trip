from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0007_expense_spent_time_known"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="spent_date_local",
            field=models.DateField(blank=True, null=True),
        ),
    ]
